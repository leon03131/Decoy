# Builds everything that goes on a GitHub release into ./release:
#   Decoy_<version>_x64-setup.exe      installer (NSIS), signed for the auto-updater
#   Decoy_<version>_x64-portable.zip   portable build: unzip and run, nothing is installed, signed for the auto-updater
#   latest.json                        the update manifest the app reads (versions, URLs, signatures, notes)
#   SHA256SUMS.txt                     checksums of the two downloads
#
#   powershell -File scripts/make-release.ps1            full build
#   powershell -File scripts/make-release.ps1 -SkipBuild reuse the last build (src-tauri/target/release)
#
# Signing: updates are signed with a private key that never lives in the repository.
#   locally  : ~/.decoy-signing/decoy.key (or the file named by $env:DECOY_SIGNING_KEY)
#   on CI    : $env:TAURI_SIGNING_PRIVATE_KEY holds the key itself (a repository secret)
#   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD is its password (empty if the key has none)
# See docs/RELEASING.md.
param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host "Decoy $version" -ForegroundColor Cyan

# ---- signing key
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    $keyFile = if ($env:DECOY_SIGNING_KEY) { $env:DECOY_SIGNING_KEY } else { Join-Path $HOME '.decoy-signing\decoy.key' }
    if (-not (Test-Path $keyFile)) {
        throw "Signing key not found at $keyFile. Without it the auto-updater would reject the release. See docs/RELEASING.md."
    }
    # the variable must hold the key itself, not a path to it (it only lives in this process)
    $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content (Resolve-Path $keyFile) -Raw).Trim()
}
if ($null -eq $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '' }

# ---- build
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
foreach ($f in @($installer, $exe, "$installer.sig")) { if (-not (Test-Path $f)) { throw "missing build output: $f" } }

$out = Join-Path $root 'release'
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null

# ---- installer
Copy-Item $installer $out
$setupName = Split-Path $installer -Leaf
$sigSetup = (Get-Content "$installer.sig" -Raw).Trim()

# ---- portable: decoy.exe + the "portable.txt" marker that switches on portable mode (all data goes to .\data)
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
Updates: Decoy checks GitHub for new versions and can replace decoy.exe in this folder
by itself (verified by a digital signature). Your "data" folder is never touched.
To remove Decoy, close it (also from the tray) and delete this folder.
"@ | Set-Content (Join-Path $stage 'portable.txt') -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $out "$name.zip"
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
Remove-Item $stage -Recurse -Force

# sign the zip (writes <zip>.sig); the installer was signed by `tauri build`
$ErrorActionPreference = 'Continue'
npx tauri signer sign $zip
$signCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($signCode -ne 0 -or -not (Test-Path "$zip.sig")) { throw 'signing the portable zip failed' }
$sigPortable = (Get-Content "$zip.sig" -Raw).Trim()
Remove-Item "$zip.sig"
$zipName = Split-Path $zip -Leaf

# ---- update manifest (the notes are the CHANGELOG section of this version)
$notes = ''
$changelog = Join-Path $root 'CHANGELOG.md'
if (Test-Path $changelog) {
    $text = Get-Content $changelog -Raw -Encoding UTF8
    $m = [regex]::Match($text, "(?ms)^## \[$([regex]::Escape($version))\][^\r\n]*\r?\n(.*?)(?=^## \[|\z)")
    if ($m.Success) { $notes = $m.Groups[1].Value.Trim() }
}
$base = "https://github.com/leon03131/Decoy/releases/download/v$version"
$installerEntry = [ordered]@{ signature = $sigSetup; url = "$base/$setupName" }
$manifest = [ordered]@{
    version  = $version
    notes    = $notes
    pub_date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = [ordered]@{
        'windows-x86_64'          = $installerEntry
        'windows-x86_64-nsis'     = $installerEntry
        'windows-x86_64-portable' = [ordered]@{ signature = $sigPortable; url = "$base/$zipName" }
    }
}
[System.IO.File]::WriteAllText((Join-Path $out 'latest.json'), ($manifest | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

# ---- checksums of the downloads
$lines = Get-ChildItem $out -File | Where-Object { $_.Name -match '\.(exe|zip)$' } | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
}
$lines | Set-Content (Join-Path $out 'SHA256SUMS.txt') -Encoding ASCII

Write-Host ''
Get-ChildItem $out -File | ForEach-Object { '{0,-40} {1,6:N2} MB' -f $_.Name, ($_.Length / 1MB) }
