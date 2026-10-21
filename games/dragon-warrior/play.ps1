# play.ps1 — launch Dragon Warrior on Windows
# Boots straight into the compiled game flow (Title Screen -> Save Select -> Throne Room / resumed save)

$Godot = $env:DW_GODOT_BIN
if (-not $Godot) {
    $GodotCmd = Get-Command godot4.exe, godot4, godot.exe, godot -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($GodotCmd) {
        $Godot = $GodotCmd.Source
    } else {
        $LocalAppData = $env:LOCALAPPDATA
        $ProgFiles = ${env:ProgramFiles}
        $ProgFilesX86 = ${env:ProgramFiles(x86)}
        $Candidates = @(
            "$LocalAppData\Programs\Godot\godot.exe",
            "$LocalAppData\Programs\Godot\godot4.exe",
            "$LocalAppData\Microsoft\WinGet\Links\godot.exe",
            "$LocalAppData\Microsoft\WinGet\Links\godot4.exe",
            "$ProgFiles\Godot\godot.exe",
            "$ProgFiles\Godot\godot4.exe",
            "$ProgFilesX86\Godot\godot.exe",
            "$ProgFilesX86\Godot\godot4.exe"
        )
        foreach ($c in $Candidates) {
            if ($c -and (Test-Path $c)) {
                $Godot = $c
                break
            }
        }
    }
}

if (-not $Godot -or -not (Test-Path $Godot)) {
    Write-Error "Godot binary not found. Set DW_GODOT_BIN or place godot4 on PATH."
    exit 1
}

$ProjectDir = $PSScriptRoot

Write-Host "Launching Dragon Warrior..."
Start-Process -FilePath $Godot -ArgumentList "--path `"$ProjectDir`""
