# launcher.ps1 — open the Quest: Warrior Dragon debug launcher GUI on Windows

$ProjectDir = $PSScriptRoot
$LauncherDir = Join-Path $ProjectDir "tools\debug-launcher"
$ElectronLocal = Join-Path $LauncherDir "node_modules\.bin\electron.cmd"

if (Test-Path $ElectronLocal) {
    Start-Process -FilePath $ElectronLocal -ArgumentList "`"$LauncherDir`""
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    Start-Process -FilePath "npx" -ArgumentList "electron `"$LauncherDir`""
} elseif (Get-Command electron -ErrorAction SilentlyContinue) {
    Start-Process -FilePath "electron" -ArgumentList "`"$LauncherDir`""
} else {
    Write-Host "Electron not installed in tools/debug-launcher. Launching game directly via play.ps1..."
    & "$ProjectDir\play.ps1"
}
