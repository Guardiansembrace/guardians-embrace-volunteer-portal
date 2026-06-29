Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-TruthyValue {
    param($Value)

    if ($null -eq $Value) {
        return $false
    }

    $normalized = $Value.ToString().Trim().ToLowerInvariant()
    return $normalized -in @('1', 'true', 'yes', 'on')
}

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Resolve-RepoRelativePath {
    param(
        [string]$RepoRoot,
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $Path
    }

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return Join-Path $RepoRoot $Path
}

function Resolve-BackendEnvFilePath {
    param(
        [string]$RepoRoot,
        [string]$ExplicitPath = ""
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        $resolvedExplicitPath = Resolve-RepoRelativePath -RepoRoot $RepoRoot -Path $ExplicitPath
        if (-not (Test-Path $resolvedExplicitPath)) {
            throw "Backend environment file not found: $resolvedExplicitPath"
        }
        return (Resolve-Path $resolvedExplicitPath).Path
    }

    foreach ($candidate in @(
        (Join-Path $RepoRoot 'backend\.env.aws'),
        (Join-Path $RepoRoot 'backend\.env')
    )) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    return (Join-Path $RepoRoot 'backend\.env')
}

function Read-DotEnvFile {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*#' -or $line -match '^\s*$') {
            continue
        }

        $parts = $line -split '=', 2
        if ($parts.Length -ne 2) {
            continue
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $values[$key] = $value
    }

    return $values
}

function Get-DefaultRegion {
    $region = (& aws configure get region).Trim()
    if ([string]::IsNullOrWhiteSpace($region)) {
        return 'us-east-1'
    }
    return $region
}

function Get-AwsCallerIdentity {
    param([string]$Region)
    return (& aws sts get-caller-identity --region $Region --output json) | ConvertFrom-Json
}

function Get-DeploymentNames {
    param(
        [string]$ProjectSlug,
        [string]$EnvironmentName,
        [string]$AccountId,
        [string]$Region
    )

    $slug = ($ProjectSlug.ToLower() -replace '[^a-z0-9-]', '-') -replace '-+', '-'
    $slug = $slug.Trim('-')
    $envName = ($EnvironmentName.ToLower() -replace '[^a-z0-9-]', '-') -replace '-+', '-'
    $envName = $envName.Trim('-')
    $prefix = "$slug-$envName"

    return [pscustomobject]@{
        StackPrefix        = $prefix
        FrontendBucketName = "$prefix-frontend-$AccountId-$Region"
        UploadsBucketName  = "$prefix-uploads-$AccountId-$Region"
        LambdaFunctionName = "$prefix-api"
        LambdaRoleName     = "$prefix-lambda-role"
        HttpApiName        = "$prefix-http"
        CloudFrontComment  = "$prefix-frontend"
        OutputsPath        = Join-Path (Get-RepoRoot) ".deployment\aws\$envName-outputs.json"
    }
}

function Save-JsonFile {
    param(
        [string]$Path,
        [Parameter(ValueFromPipeline = $true)]$Data
    )

    Ensure-Directory (Split-Path $Path -Parent)
    $json = $Data | ConvertTo-Json -Depth 20
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Load-JsonFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return $null
    }
    return (Get-Content $Path -Raw) | ConvertFrom-Json
}

function Ensure-S3Bucket {
    param(
        [string]$BucketName,
        [string]$Region
    )

    $exists = $true
    try {
        & aws s3api head-bucket --bucket $BucketName 2>$null | Out-Null
    } catch {
        $exists = $false
    }

    if ($exists) {
        return
    }

    Write-Info "Creating S3 bucket $BucketName"
    if ($Region -eq 'us-east-1') {
        & aws s3api create-bucket --bucket $BucketName --region $Region | Out-Null
    } else {
        & aws s3api create-bucket --bucket $BucketName --region $Region --create-bucket-configuration "LocationConstraint=$Region" | Out-Null
    }
}

function Get-CloudFrontWebsiteDomain {
    param(
        [string]$BucketName,
        [string]$Region
    )
    return "$BucketName.s3-website-$Region.amazonaws.com"
}
