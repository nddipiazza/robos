param(
    [switch]$BattleLab,
    [switch]$Mission,
    [switch]$Windowed
)
$ErrorActionPreference = 'Stop'
$taskGodot = $env:GODOT_BIN
if (-not $taskGodot) {
    foreach ($candidate in @('godot4', 'godot')) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { $taskGodot = $command.Source; break }
    }
}
if (-not $taskGodot) {
    $cached = Join-Path $env:USERPROFILE '.cache/robos-tools/godot-4.3/Godot_v4.3-stable_win64.exe'
    if (Test-Path -LiteralPath $cached) { $taskGodot = $cached }
}
if (-not $taskGodot -or -not (Test-Path -LiteralPath $taskGodot)) {
    throw 'Install Godot 4 or set GODOT_BIN to its executable.'
}
$launchArgs = @('--path', $PSScriptRoot)
if ($Windowed) { $launchArgs += '--windowed' }
if ($BattleLab) { $launchArgs += @('--', '--scenario=riflemen-vs-riflemen') }
if ($Mission -and $BattleLab) { throw 'Choose either -Mission or -BattleLab.' }
if ($Mission) { $launchArgs += @('--', '--scenario=campaign-first-strike') }
& $taskGodot @launchArgs
