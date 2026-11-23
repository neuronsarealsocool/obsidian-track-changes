param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../../exports'))
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
$packageManifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw | ConvertFrom-Json
$version = $packageManifest.version
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$stage = Join-Path $sourceRoot "releases/$version/obsidian-track-changes"
if (Test-Path -LiteralPath $stage) { throw "Package staging folder already exists: $stage" }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($name in @('src','tests','scripts','.github','package.json','package-lock.json','tsconfig.json','esbuild.config.mjs','README.md','LICENSE','manifest.json','versions.json','main.js','styles.css','.gitignore')) {
    $item = Join-Path $sourceRoot $name
    if ($name -eq 'tests') {
        $testDestination = Join-Path $stage 'tests'
        New-Item -ItemType Directory -Path $testDestination -Force | Out-Null
        Get-ChildItem -LiteralPath $item -File | Copy-Item -Destination $testDestination
    } else { Copy-Item -LiteralPath $item -Destination $stage -Recurse }
}
$zipPath = Join-Path $outputRoot "obsidian-track-changes-ai-ready-full-folder-$version.zip"
Compress-Archive -LiteralPath $stage -DestinationPath $zipPath -Force
Write-Output $zipPath
