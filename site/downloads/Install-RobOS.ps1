# Native, per-user RobOS app-suite setup. No WSL, USB drive or administrator required.
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:USERPROFILE 'RobOS'),
    [string]$SourceRoot,
    [string]$SourceRef = 'main',
    [switch]$NoLaunch,
    [switch]$Repair
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
if ((Test-Path (Join-Path $InstallDir 'packages')) -and !$Repair) { throw 'Choose an empty install folder, or use -Repair to retry setup in this RobOS folder.' }
if ($Repair) {
    $marker = Join-Path $InstallDir 'windows\package.json'
    if (!(Test-Path $marker) -or (Get-Content $marker -Raw | ConvertFrom-Json).name -ne 'robos-windows-launcher') { throw 'Repair requires an existing RobOS installation folder.' }
}
function Expand-RobOSArchive([string]$Archive, [string]$Destination) {
    New-Item -ItemType Directory -Force $Destination | Out-Null
    if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
        & tar.exe -xf $Archive -C $Destination
        if ($LASTEXITCODE -ne 0) { throw "Unable to extract $Archive" }
    } else { Expand-Archive $Archive $Destination }
}
New-Item -ItemType Directory -Force $InstallDir | Out-Null
$work = Join-Path $env:TEMP ('robos-setup-' + [guid]::NewGuid())
New-Item -ItemType Directory $work | Out-Null
try {
    $nodeVersion = '22.22.0'
    if (!(Test-Path "$InstallDir\runtime\node.exe")) {
        Write-Host 'Installing the private Node.js runtime...'
        $archive = "node-v$nodeVersion-win-x64.zip"
        $base = "https://nodejs.org/dist/v$nodeVersion"
        Invoke-WebRequest "$base/$archive" -UseBasicParsing -OutFile "$work\node.zip" -TimeoutSec 180
        $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 60).Content
        $expected = ($sums -split "`n" | Where-Object { $_.Trim().EndsWith(" $archive") }).Trim().Split(' ')[0]
        if (!$expected -or (Get-FileHash "$work\node.zip" -Algorithm SHA256).Hash -ne $expected) { throw 'Node.js checksum verification failed.' }
        Expand-RobOSArchive "$work\node.zip" "$work\node"
        Move-Item -LiteralPath "$work\node\node-v$nodeVersion-win-x64" -Destination "$InstallDir\runtime"
    }
    $env:PATH = "$InstallDir\runtime;$env:PATH"
    if (!(Test-Path "$InstallDir\runtime\git\cmd\git.exe")) {
        Write-Host 'Installing private Git tools for the developer apps...'
        $gitRelease = Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest'
        $gitAsset = $gitRelease.assets | Where-Object { $_.name -match '^MinGit-[\d.]+(?:\(\d+\))?-64-bit.zip$' } | Select-Object -First 1
        if (!$gitAsset) { throw 'The official Git for Windows release has no MinGit x64 archive.' }
        Invoke-WebRequest $gitAsset.browser_download_url -UseBasicParsing -OutFile "$work\git.zip"
        Expand-RobOSArchive "$work\git.zip" "$InstallDir\runtime\git"
    }
    $env:PATH = "$InstallDir\runtime\git\cmd;$env:PATH"
    if (!$SourceRoot) {
        Write-Host 'Downloading RobOS applications and game assets...'
        $git = "$InstallDir\runtime\git\cmd\git.exe"
        & $git -c core.longpaths=true -c credential.interactive=false clone --branch $SourceRef --depth 1 --filter=blob:none --sparse https://github.com/nddipiazza/robos.git "$work\source"
        if ($LASTEXITCODE -ne 0) { throw 'Unable to download the RobOS source.' }
        & $git -C "$work\source" sparse-checkout set --no-cone /packages/ /games/ /.robos/ /scripts/windows/ /site/assets/logo-mark.png /docs/assets/images/favicon.ico /docs/assets/images/logo-sidebar.png
        if ($LASTEXITCODE -ne 0) { throw 'Unable to download the RobOS app files.' }
        $SourceRoot = "$work\source"
    }
    & "$InstallDir\runtime\node.exe" (Join-Path $SourceRoot 'scripts\windows\setup.cjs') $SourceRoot $InstallDir
    if ($LASTEXITCODE -ne 0) { throw 'App setup failed. See the errors above; setup did not report success.' }
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'RobOS.lnk'))
    $shortcut.TargetPath = "$InstallDir\RobOS.cmd"
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.IconLocation = "$InstallDir\windows\robos.ico"
    $shortcut.Save()
    Write-Host "RobOS installed in $InstallDir. Open RobOS from the Start menu."
    if (!$NoLaunch) { Start-Process "$InstallDir\RobOS.cmd" -WorkingDirectory $InstallDir -WindowStyle Hidden }
} finally {
    # Only the unique staging directory allocated by this invocation is disposable.
    $resolvedWork = [IO.Path]::GetFullPath($work)
    if ($resolvedWork.StartsWith([IO.Path]::GetFullPath($env:TEMP) + '\') -and (Split-Path $resolvedWork -Leaf).StartsWith('robos-setup-')) {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
}
