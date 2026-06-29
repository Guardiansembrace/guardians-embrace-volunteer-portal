param(
    [string]$PythonExecutable = (Join-Path (Get-Location) ".venv\Scripts\python.exe"),
    [string]$PackageName = "backend-lambda.zip"
)

. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-RepoRoot
$buildRoot = Join-Path $repoRoot '.deployment\aws\build'
$stageDir = Join-Path $buildRoot 'backend-lambda'
$artifactDir = Join-Path $repoRoot '.deployment\aws\artifacts'
$zipPath = Join-Path $artifactDir $PackageName
$requirementsPath = Join-Path $repoRoot 'backend\requirements.lambda.txt'

Ensure-Directory $buildRoot
Ensure-Directory $artifactDir

if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
}
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

Ensure-Directory $stageDir

Write-Info 'Installing Lambda runtime dependencies'
# pip writes non-fatal notices (deprecations, yanked versions) to stderr. Under
# $ErrorActionPreference = 'Stop' those get promoted to terminating errors even
# when pip exits 0, so relax the preference here and gate on the real exit code.
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $PythonExecutable -m pip install `
    --upgrade `
    --target $stageDir `
    --platform manylinux2014_x86_64 `
    --implementation cp `
    --python-version 311 `
    --only-binary=:all: `
    -r $requirementsPath 2>&1 | Out-Host
$pipExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($pipExitCode -ne 0) {
    throw "pip install for the Lambda package failed with exit code $pipExitCode"
}

Write-Info 'Copying backend application code into the Lambda staging directory'
Copy-Item -Recurse -Force (Join-Path $repoRoot 'backend\app') (Join-Path $stageDir 'app')
Copy-Item -Recurse -Force (Join-Path $repoRoot 'shared') (Join-Path $stageDir 'shared')

$serviceAccountPath = Join-Path $repoRoot 'backend\service-account.json'
if (Test-Path $serviceAccountPath) {
    Write-Info 'Copying Google Drive service account credentials into the Lambda staging directory'
    Copy-Item -Force $serviceAccountPath (Join-Path $stageDir 'service-account.json')
}

Write-Info 'Creating backend Lambda zip artifact'
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force

$artifact = Get-Item $zipPath
[pscustomobject]@{
    ZipPath = $artifact.FullName
    SizeBytes = $artifact.Length
}
