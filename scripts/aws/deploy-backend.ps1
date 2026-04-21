param(
    [string]$EnvironmentName = "test",
    [string]$Region = "",
    [string]$ProjectSlug = "guardians-volunteer-portal",
    [string]$FrontendUrl = "",
    [string]$BackendEnvPath = "",
    [string]$PythonExecutable = (Join-Path (Get-Location) ".venv\Scripts\python.exe"),
    [switch]$SkipBuild,
    [string]$MongoDbUri = "",
    [switch]$UseMockDb
)

. (Join-Path $PSScriptRoot 'common.ps1')

if ([string]::IsNullOrWhiteSpace($Region)) {
    $Region = Get-DefaultRegion
}

$repoRoot = Get-RepoRoot
$backendEnvPath = Resolve-BackendEnvFilePath -RepoRoot $repoRoot -ExplicitPath $BackendEnvPath
$backendEnvLabel = "backend/$([System.IO.Path]::GetFileName($backendEnvPath))"
$backendEnv = Read-DotEnvFile $backendEnvPath
Write-Info "Using backend environment from $backendEnvLabel"
$identity = Get-AwsCallerIdentity -Region $Region
$names = Get-DeploymentNames -ProjectSlug $ProjectSlug -EnvironmentName $EnvironmentName -AccountId $identity.Account -Region $Region
$existingOutputs = Load-JsonFile $names.OutputsPath

$requiredKeys = @('MONGODB_DATABASE', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET')
foreach ($key in $requiredKeys) {
    if (-not $backendEnv.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($backendEnv[$key])) {
        throw "$backendEnvLabel is missing required key: $key"
    }
}

if ([string]::IsNullOrWhiteSpace($MongoDbUri)) {
    if (-not $backendEnv.ContainsKey('MONGODB_URI') -or [string]::IsNullOrWhiteSpace($backendEnv['MONGODB_URI'])) {
        throw "$backendEnvLabel is missing required key: MONGODB_URI"
    }
    $MongoDbUri = $backendEnv['MONGODB_URI']
}

$resolvedUseMockDb = $UseMockDb.IsPresent
if (-not $resolvedUseMockDb -and $backendEnv.ContainsKey('USE_MOCK_DB')) {
    $resolvedUseMockDb = Test-TruthyValue $backendEnv['USE_MOCK_DB']
}
if (
    -not $resolvedUseMockDb -and
    $MongoDbUri -match '^mongodb(\+srv)?://(localhost|127\.0\.0\.1)([:/]|$)'
) {
    Write-Info 'Detected a local MongoDB URI for Lambda deployment; enabling USE_MOCK_DB automatically'
    $resolvedUseMockDb = $true
}

if (
    [string]::IsNullOrWhiteSpace($FrontendUrl) -and
    $null -ne $existingOutputs -and
    ($existingOutputs.PSObject.Properties.Name -contains 'frontend') -and
    ($existingOutputs.frontend.PSObject.Properties.Name -contains 'cloudFrontUrl') -and
    $null -ne $existingOutputs.frontend.cloudFrontUrl
) {
    $FrontendUrl = [string]$existingOutputs.frontend.cloudFrontUrl
}

Ensure-S3Bucket -BucketName $names.UploadsBucketName -Region $Region

$corsPath = Join-Path $repoRoot '.deployment\aws\uploads-cors.json'
@{
    CORSRules = @(
        @{
            AllowedHeaders = @('*')
            AllowedMethods = @('GET', 'HEAD', 'PUT')
            AllowedOrigins = @('*')
            ExposeHeaders  = @('ETag')
            MaxAgeSeconds  = 3000
        }
    )
} | Save-JsonFile -Path $corsPath
& aws s3api put-bucket-cors --bucket $names.UploadsBucketName --cors-configuration "file://$corsPath" --region $Region | Out-Null

$trustPolicyPath = Join-Path $repoRoot '.deployment\aws\lambda-trust-policy.json'
@{
    Version   = '2012-10-17'
    Statement = @(
        @{
            Effect    = 'Allow'
            Principal = @{ Service = 'lambda.amazonaws.com' }
            Action    = 'sts:AssumeRole'
        }
    )
} | Save-JsonFile -Path $trustPolicyPath

$role = $null
try {
    $role = & aws iam get-role --role-name $names.LambdaRoleName --output json 2>$null
    if ($LASTEXITCODE -ne 0) {
        $role = $null
    }
} catch {
    $role = $null
}
if ($null -eq $role) {
    Write-Info "Creating Lambda execution role $($names.LambdaRoleName)"
    $role = & aws iam create-role --role-name $names.LambdaRoleName --assume-role-policy-document "file://$trustPolicyPath" --output json
    & aws iam attach-role-policy --role-name $names.LambdaRoleName --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole | Out-Null
    Start-Sleep -Seconds 10
}

$roleArn = ((& aws iam get-role --role-name $names.LambdaRoleName --output json) | ConvertFrom-Json).Role.Arn

$bucketPolicyPath = Join-Path $repoRoot '.deployment\aws\lambda-s3-policy.json'
@{
    Version   = '2012-10-17'
    Statement = @(
        @{
            Effect   = 'Allow'
            Action   = @('s3:ListBucket')
            Resource = "arn:aws:s3:::$($names.UploadsBucketName)"
        },
        @{
            Effect   = 'Allow'
            Action   = @('s3:GetObject', 's3:PutObject', 's3:DeleteObject')
            Resource = "arn:aws:s3:::$($names.UploadsBucketName)/*"
        }
    )
} | Save-JsonFile -Path $bucketPolicyPath
& aws iam put-role-policy --role-name $names.LambdaRoleName --policy-name "$($names.StackPrefix)-uploads" --policy-document "file://$bucketPolicyPath" | Out-Null

$artifact = $null
if (-not $SkipBuild) {
    $artifact = & (Join-Path $PSScriptRoot 'build-backend-package.ps1') -PythonExecutable $PythonExecutable
}

$gitSha = (& git -C $repoRoot rev-parse --short HEAD 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($gitSha)) {
    $gitSha = 'local'
}

$allowedOrigins = if ([string]::IsNullOrWhiteSpace($FrontendUrl)) {
    $backendEnv['ALLOWED_ORIGINS']
} else {
    "[`"$FrontendUrl`"]"
}

$frontendBaseUrl = if ([string]::IsNullOrWhiteSpace($FrontendUrl)) {
    if ($backendEnv.ContainsKey('FRONTEND_URL')) { $backendEnv['FRONTEND_URL'] } else { '' }
} else {
    $FrontendUrl
}

$googleApplicationCredentials = ''
if ($backendEnv.ContainsKey('GOOGLE_APPLICATION_CREDENTIALS') -and -not [string]::IsNullOrWhiteSpace($backendEnv['GOOGLE_APPLICATION_CREDENTIALS'])) {
    $googleApplicationCredentials = $backendEnv['GOOGLE_APPLICATION_CREDENTIALS']
} elseif (Test-Path (Join-Path $repoRoot 'backend\service-account.json')) {
    $googleApplicationCredentials = 'service-account.json'
}

$privateFileStorageBackend = if ($backendEnv.ContainsKey('PRIVATE_FILE_STORAGE_BACKEND')) {
    $backendEnv['PRIVATE_FILE_STORAGE_BACKEND']
} else {
    'auto'
}

$lambdaEnvPath = Join-Path $repoRoot '.deployment\aws\lambda-environment.json'
@{
    Variables = @{
        APP_NAME                          = if ($backendEnv.ContainsKey('APP_NAME')) { $backendEnv['APP_NAME'] } else { "Guardian's Embrace Volunteer Portal" }
        APP_VERSION                       = $gitSha
        DEBUG                             = 'false'
        MONITORING_ENABLED                = if ($backendEnv.ContainsKey('MONITORING_ENABLED')) { $backendEnv['MONITORING_ENABLED'] } else { 'true' }
        FRONTEND_ERROR_INGEST_ENABLED     = if ($backendEnv.ContainsKey('FRONTEND_ERROR_INGEST_ENABLED')) { $backendEnv['FRONTEND_ERROR_INGEST_ENABLED'] } else { 'true' }
        LOG_TO_FILE                       = 'false'
        MONGODB_URI                       = $MongoDbUri
        MONGODB_DATABASE                  = $backendEnv['MONGODB_DATABASE']
        USE_MOCK_DB                       = if ($resolvedUseMockDb) { 'true' } else { 'false' }
        GOOGLE_CLIENT_ID                  = $backendEnv['GOOGLE_CLIENT_ID']
        GOOGLE_CLIENT_SECRET              = $backendEnv['GOOGLE_CLIENT_SECRET']
        JWT_SECRET                        = $backendEnv['JWT_SECRET']
        JWT_ALGORITHM                     = if ($backendEnv.ContainsKey('JWT_ALGORITHM')) { $backendEnv['JWT_ALGORITHM'] } else { 'HS256' }
        JWT_EXPIRE_MINUTES                = if ($backendEnv.ContainsKey('JWT_EXPIRE_MINUTES')) { $backendEnv['JWT_EXPIRE_MINUTES'] } else { '10080' }
        ADMIN_EMAILS                      = if ($backendEnv.ContainsKey('ADMIN_EMAILS')) { $backendEnv['ADMIN_EMAILS'] } else { '' }
        ALLOWED_ORIGINS                   = $allowedOrigins
        FRONTEND_URL                      = $frontendBaseUrl
        GOOGLE_DRIVE_SHARED_DRIVE_ID      = if ($backendEnv.ContainsKey('GOOGLE_DRIVE_SHARED_DRIVE_ID')) { $backendEnv['GOOGLE_DRIVE_SHARED_DRIVE_ID'] } else { '' }
        GOOGLE_DRIVE_CREDENTIALS_JSON     = if ($backendEnv.ContainsKey('GOOGLE_DRIVE_CREDENTIALS_JSON')) { $backendEnv['GOOGLE_DRIVE_CREDENTIALS_JSON'] } else { '' }
        GOOGLE_APPLICATION_CREDENTIALS    = $googleApplicationCredentials
        WEEKLY_UPDATE_START_DAY           = if ($backendEnv.ContainsKey('WEEKLY_UPDATE_START_DAY')) { $backendEnv['WEEKLY_UPDATE_START_DAY'] } else { 'friday' }
        WEEKLY_UPDATE_END_DAY             = if ($backendEnv.ContainsKey('WEEKLY_UPDATE_END_DAY')) { $backendEnv['WEEKLY_UPDATE_END_DAY'] } else { 'sunday' }
        TIMEZONE                          = if ($backendEnv.ContainsKey('TIMEZONE')) { $backendEnv['TIMEZONE'] } else { 'America/New_York' }
        SMTP_HOST                         = if ($backendEnv.ContainsKey('SMTP_HOST')) { $backendEnv['SMTP_HOST'] } else { '' }
        SMTP_PORT                         = if ($backendEnv.ContainsKey('SMTP_PORT')) { $backendEnv['SMTP_PORT'] } else { '587' }
        SMTP_USERNAME                     = if ($backendEnv.ContainsKey('SMTP_USERNAME')) { $backendEnv['SMTP_USERNAME'] } else { '' }
        SMTP_PASSWORD                     = if ($backendEnv.ContainsKey('SMTP_PASSWORD')) { $backendEnv['SMTP_PASSWORD'] } else { '' }
        SMTP_FROM_EMAIL                   = if ($backendEnv.ContainsKey('SMTP_FROM_EMAIL')) { $backendEnv['SMTP_FROM_EMAIL'] } else { '' }
        SMTP_FROM_NAME                    = if ($backendEnv.ContainsKey('SMTP_FROM_NAME')) { $backendEnv['SMTP_FROM_NAME'] } else { "Guardian's Embrace" }
        SMTP_USE_STARTTLS                 = if ($backendEnv.ContainsKey('SMTP_USE_STARTTLS')) { $backendEnv['SMTP_USE_STARTTLS'] } else { 'true' }
        SMTP_USE_SSL                      = if ($backendEnv.ContainsKey('SMTP_USE_SSL')) { $backendEnv['SMTP_USE_SSL'] } else { 'false' }
        SMTP_VALIDATE_CERTS               = if ($backendEnv.ContainsKey('SMTP_VALIDATE_CERTS')) { $backendEnv['SMTP_VALIDATE_CERTS'] } else { 'true' }
        FILE_DOWNLOAD_TOKEN_EXPIRE_MINUTES = if ($backendEnv.ContainsKey('FILE_DOWNLOAD_TOKEN_EXPIRE_MINUTES')) { $backendEnv['FILE_DOWNLOAD_TOKEN_EXPIRE_MINUTES'] } else { '5' }
        PRIVATE_FILE_STORAGE_BACKEND      = $privateFileStorageBackend
        AWS_S3_BUCKET                     = $names.UploadsBucketName
        AWS_PUBLIC_ASSETS_BASE_URL        = if ($backendEnv.ContainsKey('AWS_PUBLIC_ASSETS_BASE_URL')) { $backendEnv['AWS_PUBLIC_ASSETS_BASE_URL'] } else { '' }
    }
} | Save-JsonFile -Path $lambdaEnvPath

$functionExists = $false
try {
    & aws lambda get-function --function-name $names.LambdaFunctionName --region $Region --output json 2>$null | Out-Null
    $functionExists = $LASTEXITCODE -eq 0
} catch {
    $functionExists = $false
}

if ($null -ne $artifact) {
    $useS3Artifact = $artifact.SizeBytes -gt 48000000
    $artifactKey = "artifacts/$EnvironmentName/backend-lambda.zip"

    if ($useS3Artifact) {
        Write-Info 'Uploading Lambda artifact to S3 because the zip is larger than the direct upload limit'
        & aws s3 cp $artifact.ZipPath "s3://$($names.UploadsBucketName)/$artifactKey" --region $Region | Out-Null
    }

    if (-not $functionExists) {
        Write-Info "Creating Lambda function $($names.LambdaFunctionName)"
        if ($useS3Artifact) {
            & aws lambda create-function `
                --function-name $names.LambdaFunctionName `
                --runtime python3.11 `
                --handler app.lambda_handler.handler `
                --architectures x86_64 `
                --memory-size 1024 `
                --timeout 30 `
                --role $roleArn `
                --region $Region `
                --environment "file://$lambdaEnvPath" `
                --code "S3Bucket=$($names.UploadsBucketName),S3Key=$artifactKey" | Out-Null
        } else {
            & aws lambda create-function `
                --function-name $names.LambdaFunctionName `
                --runtime python3.11 `
                --handler app.lambda_handler.handler `
                --architectures x86_64 `
                --memory-size 1024 `
                --timeout 30 `
                --role $roleArn `
                --region $Region `
                --environment "file://$lambdaEnvPath" `
                --zip-file "fileb://$($artifact.ZipPath)" | Out-Null
        }
        & aws lambda wait function-active --function-name $names.LambdaFunctionName --region $Region
    } else {
        Write-Info "Updating Lambda function code for $($names.LambdaFunctionName)"
        if ($useS3Artifact) {
            & aws lambda update-function-code `
                --function-name $names.LambdaFunctionName `
                --region $Region `
                --s3-bucket $names.UploadsBucketName `
                --s3-key $artifactKey | Out-Null
        } else {
            & aws lambda update-function-code `
                --function-name $names.LambdaFunctionName `
                --region $Region `
                --zip-file "fileb://$($artifact.ZipPath)" | Out-Null
        }
        & aws lambda wait function-updated --function-name $names.LambdaFunctionName --region $Region
    }
}

if ($functionExists -or [string]::IsNullOrWhiteSpace($FrontendUrl) -eq $false -or $SkipBuild) {
    Write-Info "Updating Lambda configuration for $($names.LambdaFunctionName)"
    & aws lambda update-function-configuration `
        --function-name $names.LambdaFunctionName `
        --memory-size 1024 `
        --timeout 30 `
        --region $Region `
        --environment "file://$lambdaEnvPath" | Out-Null
    & aws lambda wait function-updated --function-name $names.LambdaFunctionName --region $Region
}

$apis = ((& aws apigatewayv2 get-apis --region $Region --output json) | ConvertFrom-Json).Items
$api = $apis | Where-Object { $_.Name -eq $names.HttpApiName } | Select-Object -First 1
if ($null -eq $api) {
    Write-Info "Creating HTTP API $($names.HttpApiName)"
    $api = (& aws apigatewayv2 create-api --name $names.HttpApiName --protocol-type HTTP --region $Region --output json) | ConvertFrom-Json
}

$apiId = $api.ApiId
$functionArn = "arn:aws:lambda:${Region}:$($identity.Account):function:$($names.LambdaFunctionName)"
$integrations = ((& aws apigatewayv2 get-integrations --api-id $apiId --region $Region --output json) | ConvertFrom-Json).Items
$integration = $integrations | Select-Object -First 1

if ($null -eq $integration) {
    Write-Info 'Creating API Gateway Lambda integration'
    $integration = (& aws apigatewayv2 create-integration `
        --api-id $apiId `
        --integration-type AWS_PROXY `
        --integration-uri $functionArn `
        --payload-format-version 2.0 `
        --region $Region `
        --output json) | ConvertFrom-Json
} else {
    & aws apigatewayv2 update-integration `
        --api-id $apiId `
        --integration-id $integration.IntegrationId `
        --integration-uri $functionArn `
        --payload-format-version 2.0 `
        --region $Region | Out-Null
}

$integrationId = $integration.IntegrationId
$routes = ((& aws apigatewayv2 get-routes --api-id $apiId --region $Region --output json) | ConvertFrom-Json).Items

foreach ($routeKey in @('ANY /', 'ANY /{proxy+}')) {
    $existingRoute = $routes | Where-Object { $_.RouteKey -eq $routeKey } | Select-Object -First 1
    if ($null -eq $existingRoute) {
        & aws apigatewayv2 create-route --api-id $apiId --route-key $routeKey --target "integrations/$integrationId" --region $Region | Out-Null
    } else {
        & aws apigatewayv2 update-route --api-id $apiId --route-id $existingRoute.RouteId --target "integrations/$integrationId" --region $Region | Out-Null
    }
}

$stageExists = $false
try {
    & aws apigatewayv2 get-stage --api-id $apiId --stage-name '$default' --region $Region --output json 2>$null | Out-Null
    $stageExists = $LASTEXITCODE -eq 0
} catch {
    $stageExists = $false
}
if (-not $stageExists) {
    & aws apigatewayv2 create-stage --api-id $apiId --stage-name '$default' --auto-deploy --region $Region | Out-Null
} else {
    & aws apigatewayv2 update-stage --api-id $apiId --stage-name '$default' --auto-deploy --region $Region | Out-Null
}

$permissionStatementId = "$($names.StackPrefix)-apigw"
try {
    & aws lambda add-permission `
        --function-name $names.LambdaFunctionName `
        --statement-id $permissionStatementId `
        --action lambda:InvokeFunction `
        --principal apigateway.amazonaws.com `
        --source-arn "arn:aws:execute-api:${Region}:$($identity.Account):$apiId/*/*" `
        --region $Region 2>$null | Out-Null
} catch {
    Write-Info 'Lambda invoke permission already exists or could not be added again; continuing'
}

$apiUrl = "https://$apiId.execute-api.$Region.amazonaws.com"

$outputs = if ($null -ne $existingOutputs) { $existingOutputs } else { [pscustomobject]@{} }
$outputs | Add-Member -NotePropertyName environment -NotePropertyValue $EnvironmentName -Force
$outputs | Add-Member -NotePropertyName region -NotePropertyValue $Region -Force
$outputs | Add-Member -NotePropertyName accountId -NotePropertyValue $identity.Account -Force
$outputs | Add-Member -NotePropertyName backend -NotePropertyValue ([pscustomobject]@{
    lambdaFunctionName = $names.LambdaFunctionName
    lambdaRoleName     = $names.LambdaRoleName
    uploadsBucketName  = $names.UploadsBucketName
    apiId              = $apiId
    apiUrl             = $apiUrl
}) -Force
$outputs | Save-JsonFile -Path $names.OutputsPath

[pscustomobject]@{
    LambdaFunctionName = $names.LambdaFunctionName
    UploadsBucketName  = $names.UploadsBucketName
    ApiId              = $apiId
    ApiUrl             = $apiUrl
    OutputsPath        = $names.OutputsPath
}
