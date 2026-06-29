param(
    [string]$EnvironmentName = "test",
    [string]$Region = "",
    [string]$ProjectSlug = "guardians-volunteer-portal",
    [string]$BackendEnvPath = "",
    [switch]$WaitForCloudFront,
    [string]$MongoDbUri = "",
    [switch]$UseMockDb,
    [int]$HealthCheckRetries = 12,
    [int]$HealthCheckDelaySeconds = 5
)

. (Join-Path $PSScriptRoot 'common.ps1')

if ([string]::IsNullOrWhiteSpace($Region)) {
    $Region = Get-DefaultRegion
}

Write-Info "Deploying backend for environment '$EnvironmentName'"
$backend = (& (Join-Path $PSScriptRoot 'deploy-backend.ps1') `
    -EnvironmentName $EnvironmentName `
    -Region $Region `
    -ProjectSlug $ProjectSlug `
    -BackendEnvPath $BackendEnvPath `
    -MongoDbUri $MongoDbUri `
    -UseMockDb:$UseMockDb) | Select-Object -Last 1

Write-Info "Deploying frontend for environment '$EnvironmentName'"
$frontend = (& (Join-Path $PSScriptRoot 'deploy-frontend.ps1') `
    -EnvironmentName $EnvironmentName `
    -Region $Region `
    -ProjectSlug $ProjectSlug `
    -BackendEnvPath $BackendEnvPath `
    -ApiUrl $backend.ApiUrl `
    -WaitForDeployment:$WaitForCloudFront) | Select-Object -Last 1

Write-Info 'Updating backend CORS and frontend URL to the CloudFront endpoint'
$backend = (& (Join-Path $PSScriptRoot 'deploy-backend.ps1') `
    -EnvironmentName $EnvironmentName `
    -Region $Region `
    -ProjectSlug $ProjectSlug `
    -FrontendUrl $frontend.CloudFrontUrl `
    -BackendEnvPath $BackendEnvPath `
    -SkipBuild `
    -MongoDbUri $MongoDbUri `
    -UseMockDb:$UseMockDb) | Select-Object -Last 1

Write-Info 'Verifying API health endpoint'
$healthUrl = "$($backend.ApiUrl)/health"
$health = $null

for ($attempt = 1; $attempt -le $HealthCheckRetries; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 30
        break
    } catch {
        if ($attempt -ge $HealthCheckRetries) {
            throw
        }
        Write-Info "Health check attempt $attempt/$HealthCheckRetries failed; retrying in $HealthCheckDelaySeconds seconds"
        Start-Sleep -Seconds $HealthCheckDelaySeconds
    }
}

# Handled AWS CLI calls (e.g. an already-existing Lambda permission) leave a
# non-zero $LASTEXITCODE behind. Reaching this point means every step plus the
# health check succeeded, so clear it for a clean process exit code.
$global:LASTEXITCODE = 0

[pscustomobject]@{
    Environment = $EnvironmentName
    Region      = $Region
    BackendUrl  = $backend.ApiUrl
    FrontendUrl = $frontend.CloudFrontUrl
    WebsiteUrl  = $frontend.WebsiteUrl
    Health      = $health
    OutputsPath = $backend.OutputsPath
}

exit 0
