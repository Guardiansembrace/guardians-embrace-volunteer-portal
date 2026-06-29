param(
    [Parameter(Mandatory = $true)]
    [string]$ApiUrl,
    [string]$EnvironmentName = "test",
    [string]$Region = "",
    [string]$ProjectSlug = "guardians-volunteer-portal",
    [string]$BackendEnvPath = "",
    [switch]$WaitForDeployment
)

. (Join-Path $PSScriptRoot 'common.ps1')

if ([string]::IsNullOrWhiteSpace($Region)) {
    $Region = Get-DefaultRegion
}

$repoRoot = Get-RepoRoot
$frontendEnv = Read-DotEnvFile (Join-Path $repoRoot 'frontend-react\.env')
$backendEnvPath = Resolve-BackendEnvFilePath -RepoRoot $repoRoot -ExplicitPath $BackendEnvPath
$backendEnvLabel = "backend/$([System.IO.Path]::GetFileName($backendEnvPath))"
$backendEnv = Read-DotEnvFile $backendEnvPath
Write-Info "Using backend environment from $backendEnvLabel"
$identity = Get-AwsCallerIdentity -Region $Region
$names = Get-DeploymentNames -ProjectSlug $ProjectSlug -EnvironmentName $EnvironmentName -AccountId $identity.Account -Region $Region
$existingOutputs = Load-JsonFile $names.OutputsPath

$googleClientId = if ($frontendEnv.ContainsKey('VITE_GOOGLE_CLIENT_ID')) { $frontendEnv['VITE_GOOGLE_CLIENT_ID'] } else { $backendEnv['GOOGLE_CLIENT_ID'] }
if ([string]::IsNullOrWhiteSpace($googleClientId)) {
    throw "No Google client ID found in frontend-react/.env or $backendEnvLabel"
}

Ensure-S3Bucket -BucketName $names.FrontendBucketName -Region $Region

Write-Info "Configuring frontend bucket $($names.FrontendBucketName) for website hosting"
& aws s3api put-public-access-block `
    --bucket $names.FrontendBucketName `
    --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false `
    --region $Region | Out-Null

$bucketPolicyPath = Join-Path $repoRoot '.deployment\aws\frontend-bucket-policy.json'
@{
    Version   = '2012-10-17'
    Statement = @(
        @{
            Sid       = 'PublicReadForTesting'
            Effect    = 'Allow'
            Principal = '*'
            Action    = 's3:GetObject'
            Resource  = "arn:aws:s3:::$($names.FrontendBucketName)/*"
        }
    )
} | Save-JsonFile -Path $bucketPolicyPath
& aws s3api put-bucket-policy --bucket $names.FrontendBucketName --policy "file://$bucketPolicyPath" --region $Region | Out-Null

$websiteConfigPath = Join-Path $repoRoot '.deployment\aws\frontend-website.json'
@{
    IndexDocument = @{ Suffix = 'index.html' }
    ErrorDocument = @{ Key = 'index.html' }
} | Save-JsonFile -Path $websiteConfigPath
& aws s3api put-bucket-website --bucket $names.FrontendBucketName --website-configuration "file://$websiteConfigPath" --region $Region | Out-Null

$gitSha = (& git -C $repoRoot rev-parse --short HEAD 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($gitSha)) {
    $gitSha = 'local'
}

Write-Info 'Building frontend for the deployed API URL'
$env:VITE_API_URL = $ApiUrl
$env:VITE_GOOGLE_CLIENT_ID = $googleClientId
$env:VITE_MONITORING_ENABLED = if ($frontendEnv.ContainsKey('VITE_MONITORING_ENABLED')) { $frontendEnv['VITE_MONITORING_ENABLED'] } else { 'true' }
$env:VITE_APP_VERSION = $gitSha
Push-Location (Join-Path $repoRoot 'frontend-react')
try {
    # npm/vite/browserslist emit non-fatal notices to stderr. Merge them into
    # stdout inside cmd and gate on the real exit code so a warning under
    # $ErrorActionPreference = 'Stop' does not abort the deploy.
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & cmd /c 'npm.cmd run build 2>&1' | Out-Host
    $buildExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($buildExitCode -ne 0) {
        throw "Frontend build failed with exit code $buildExitCode"
    }
} finally {
    Pop-Location
}

Write-Info 'Uploading frontend assets to S3'
& aws s3 sync (Join-Path $repoRoot 'frontend-react\dist') "s3://$($names.FrontendBucketName)/" --delete --region $Region | Out-Null

$distributionId = $null
if (
    $null -ne $existingOutputs -and
    ($existingOutputs.PSObject.Properties.Name -contains 'frontend') -and
    ($existingOutputs.frontend.PSObject.Properties.Name -contains 'distributionId') -and
    $null -ne $existingOutputs.frontend.distributionId
) {
    $distributionId = [string]$existingOutputs.frontend.distributionId
}

if ([string]::IsNullOrWhiteSpace($distributionId)) {
    $distributions = ((& aws cloudfront list-distributions --output json) | ConvertFrom-Json).DistributionList.Items
    if ($null -ne $distributions) {
        $existingDistribution = $distributions | Where-Object { $_.Comment -eq $names.CloudFrontComment } | Select-Object -First 1
        if ($null -ne $existingDistribution) {
            $distributionId = [string]$existingDistribution.Id
        }
    }
}

if ([string]::IsNullOrWhiteSpace($distributionId)) {
    Write-Info 'Creating CloudFront distribution for the frontend'
    $distributionConfigPath = Join-Path $repoRoot '.deployment\aws\cloudfront-distribution.json'
    $originDomain = Get-CloudFrontWebsiteDomain -BucketName $names.FrontendBucketName -Region $Region
    @{
        CallerReference      = "$($names.StackPrefix)-$(Get-Date -Format 'yyyyMMddHHmmss')"
        Comment              = $names.CloudFrontComment
        DefaultRootObject    = 'index.html'
        Enabled              = $true
        IsIPV6Enabled        = $true
        PriceClass           = 'PriceClass_100'
        HttpVersion          = 'http2'
        Aliases              = @{ Quantity = 0 }
        Origins              = @{
            Quantity = 1
            Items    = @(
                @{
                    Id                = 'frontend-s3-website'
                    DomainName        = $originDomain
                    CustomOriginConfig = @{
                        HTTPPort              = 80
                        HTTPSPort             = 443
                        OriginProtocolPolicy  = 'http-only'
                        OriginSslProtocols    = @{
                            Quantity = 3
                            Items    = @('TLSv1', 'TLSv1.1', 'TLSv1.2')
                        }
                    }
                }
            )
        }
        DefaultCacheBehavior = @{
            TargetOriginId       = 'frontend-s3-website'
            ViewerProtocolPolicy = 'redirect-to-https'
            Compress             = $true
            AllowedMethods       = @{
                Quantity      = 2
                Items         = @('GET', 'HEAD')
                CachedMethods = @{
                    Quantity = 2
                    Items    = @('GET', 'HEAD')
                }
            }
            ForwardedValues      = @{
                QueryString = $false
                Cookies     = @{ Forward = 'none' }
            }
            TrustedSigners       = @{
                Enabled  = $false
                Quantity = 0
            }
            TrustedKeyGroups     = @{
                Enabled  = $false
                Quantity = 0
            }
            MinTTL               = 0
            DefaultTTL           = 300
            MaxTTL               = 31536000
        }
        CacheBehaviors         = @{ Quantity = 0 }
        CustomErrorResponses   = @{
            Quantity = 2
            Items    = @(
                @{
                    ErrorCode          = 403
                    ResponsePagePath   = '/index.html'
                    ResponseCode       = '200'
                    ErrorCachingMinTTL = 0
                },
                @{
                    ErrorCode          = 404
                    ResponsePagePath   = '/index.html'
                    ResponseCode       = '200'
                    ErrorCachingMinTTL = 0
                }
            )
        }
        Restrictions           = @{
            GeoRestriction = @{
                RestrictionType = 'none'
                Quantity        = 0
            }
        }
        ViewerCertificate      = @{
            CloudFrontDefaultCertificate = $true
        }
    } | Save-JsonFile -Path $distributionConfigPath

    $createdDistribution = (& aws cloudfront create-distribution --distribution-config "file://$distributionConfigPath" --output json) | ConvertFrom-Json
    $distributionId = [string]$createdDistribution.Distribution.Id
}

Write-Info 'Creating CloudFront invalidation'
& aws cloudfront create-invalidation --distribution-id $distributionId --paths '/*' | Out-Null

if ($WaitForDeployment) {
    Write-Info 'Waiting for CloudFront deployment to finish'
    & aws cloudfront wait distribution-deployed --id $distributionId
}

$distribution = (& aws cloudfront get-distribution --id $distributionId --output json) | ConvertFrom-Json
$cloudFrontDomain = [string]$distribution.Distribution.DomainName
$cloudFrontUrl = "https://$cloudFrontDomain"
$websiteUrl = "http://$(Get-CloudFrontWebsiteDomain -BucketName $names.FrontendBucketName -Region $Region)"

$outputs = if ($null -ne $existingOutputs) { $existingOutputs } else { [pscustomobject]@{} }
$outputs | Add-Member -NotePropertyName environment -NotePropertyValue $EnvironmentName -Force
$outputs | Add-Member -NotePropertyName region -NotePropertyValue $Region -Force
$outputs | Add-Member -NotePropertyName accountId -NotePropertyValue $identity.Account -Force
$outputs | Add-Member -NotePropertyName frontend -NotePropertyValue ([pscustomobject]@{
    bucketName      = $names.FrontendBucketName
    websiteUrl      = $websiteUrl
    distributionId  = $distributionId
    cloudFrontUrl   = $cloudFrontUrl
}) -Force
$outputs | Save-JsonFile -Path $names.OutputsPath

[pscustomobject]@{
    BucketName     = $names.FrontendBucketName
    DistributionId = $distributionId
    WebsiteUrl     = $websiteUrl
    CloudFrontUrl  = $cloudFrontUrl
    OutputsPath    = $names.OutputsPath
}
