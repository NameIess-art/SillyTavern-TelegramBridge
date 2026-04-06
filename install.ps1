param(
    [Parameter(Mandatory = $true)]
    [string]$SillyTavernRoot,

    [string]$UserHandle = 'default-user',

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedPackageRoot = (Resolve-Path $packageRoot).Path
$resolvedTargetRoot = (Resolve-Path $SillyTavernRoot).Path

if (-not (Test-Path (Join-Path $resolvedTargetRoot 'plugins'))) {
    throw "Target SillyTavern root does not contain a plugins folder: $resolvedTargetRoot"
}

$pluginSource = Join-Path $resolvedPackageRoot 'plugins\\telegram-bridge'
$extensionSource = Join-Path $resolvedPackageRoot 'extensions\\telegram-bridge'

$pluginTarget = Join-Path $resolvedTargetRoot 'plugins\\telegram-bridge'
$extensionTarget = Join-Path $resolvedTargetRoot \"data\\$UserHandle\\extensions\\telegram-bridge\"

if (-not (Test-Path $pluginSource)) {
    throw "Missing plugin source folder: $pluginSource"
}

if (-not (Test-Path $extensionSource)) {
    throw "Missing extension source folder: $extensionSource"
}

if ((Test-Path $pluginTarget) -and (-not $Force)) {
    throw "Plugin target already exists: $pluginTarget`nRe-run with -Force to overwrite."
}

if ((Test-Path $extensionTarget) -and (-not $Force)) {
    throw "Extension target already exists: $extensionTarget`nRe-run with -Force to overwrite."
}

New-Item -ItemType Directory -Path (Split-Path -Parent $extensionTarget) -Force | Out-Null

if (Test-Path $pluginTarget) {
    Remove-Item -LiteralPath $pluginTarget -Recurse -Force
}

if (Test-Path $extensionTarget) {
    Remove-Item -LiteralPath $extensionTarget -Recurse -Force
}

Copy-Item -LiteralPath $pluginSource -Destination $pluginTarget -Recurse -Force
Copy-Item -LiteralPath $extensionSource -Destination $extensionTarget -Recurse -Force

Write-Host "Installed server plugin to: $pluginTarget"
Write-Host "Installed front-end extension to: $extensionTarget"
Write-Host "Make sure config.yaml contains: enableServerPlugins: true"
Write-Host "Then restart SillyTavern."
