# Builds everything that goes on a GitHub release into ./release:
#   Decoy_<version>_x64-setup.exe      installer (NSIS)
#   Decoy_<version>_x64-portable.zip   portable build: unzip and run, nothing is installed
#   SHA256SUMS.txt                     checksums of both files
#
#   powershell -File scripts/make-release.ps1            full build
#   powershell -File scripts/make-release.ps1 -SkipBuild reuse the last build (src-tauri/target/release)
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Decoy $version" -ForegroundColor Cyan

if (-not $SkipBuild) {
    # Tauri prints progress to stderr; with 'Stop' Windows PowerShell would treat that as a failure
    $ErrorActionPreference = 'Continue'
    npm run tauri build
    $buildCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($buildCode -ne 0) { throw 'tauri build failed' }
}

$bundle = Join-Path $root 'src-tauri\target\release'
$installer = Join-Path $bundle "bundle\nsis\Decoy_${version}_x64-setup.exe"
$exe = Join-Path $bundle 'decoy.exe'
foreach ($f in @($installer, $exe)) { if (-not (Test-Path $f)) { throw "missing build output: $f" } }

$out = Join-Path $root 'release'
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null

# installer
Copy-Item $installer $out

# portable: decoy.exe + the "portable.txt" marker that switches on portable mode (all data goes to .\data)
$name = "Decoy_${version}_x64-portable"
$stage = Join-Path $out $name
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item $exe (Join-Path $stage 'decoy.exe')
Copy-Item (Join-Path $root 'LICENSE') (Join-Path $stage 'LICENSE.txt')
@"
Decoy $version - portable

This file switches Decoy to portable mode: the game list, settings and the browser
cache are kept in the "data" folder next to decoy.exe, and nothing is written to your
user profile. Delete this file to use the normal locations again.

Requirements: Windows 10/11 (64-bit) with the WebView2 runtime (included in Windows 11).
To remove Decoy, close it (also from the tray) and delete this folder.
"@ | Set-Content (Join-Path $stage 'portable.txt') -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $out "$name.zip"
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
Remove-Item $stage -Recurse -Force

# checksums
$lines = Get-ChildItem $out -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
}
$lines | Set-Content (Join-Path $out 'SHA256SUMS.txt') -Encoding ASCII

Write-Host ''
Get-ChildItem $out -File | ForEach-Object { '{0,-40} {1,6:N2} MB' -f $_.Name, ($_.Length / 1MB) }
