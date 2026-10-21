# debug.ps1 — launch Quest: Warrior Dragon into any scene with a preset hero state on Windows
#
# Usage:
#   .\debug.ps1 [-Scene <Name>] [-Tile <col,row>] [-Facing <dir>] [-Gold <n>]
#               [-Items "Item1;Item2"] [-From <id>]
#               [-AllChests "id;id;..."] [-UnlockedDoors "door_id;..."]
#               [-SaveStateFile <path>]

param(
    [string]$Scene = $env:DW_SCENE,
    [string]$Tile = $env:DW_TILE,
    [string]$Facing = $env:DW_FACING,
    [string]$Gold = $env:DW_GOLD,
    [string]$Items = $env:DW_ITEMS,
    [string]$From = $env:DW_FROM,
    [string]$AllChests = $env:DW_ALL_CHESTS,
    [string]$UnlockedDoors = $env:DW_UNLOCKED_DOORS,
    [string]$Monster = $env:DW_MONSTER,
    [string]$HeroName = $env:DW_HERO_NAME,
    [string]$HeroLevel = $env:DW_HERO_LEVEL,
    [string]$HeroHp = $env:DW_HERO_HP,
    [string]$HeroHpMax = $env:DW_HERO_HP_MAX,
    [string]$HeroMp = $env:DW_HERO_MP,
    [string]$HeroMpMax = $env:DW_HERO_MP_MAX,
    [string]$HeroStr = $env:DW_HERO_STR,
    [string]$HeroAtk = $env:DW_HERO_ATK,
    [string]$HeroDef = $env:DW_HERO_DEF,
    [string]$HeroAgl = $env:DW_HERO_AGL,
    [string]$HeroExp = $env:DW_HERO_EXP,
    [string]$HeroSpells = $env:DW_HERO_SPELLS,
    [string]$HeroWeapon = $env:DW_HERO_WEAPON,
    [string]$HeroArmor = $env:DW_HERO_ARMOR,
    [string]$BridgeBuilt = $env:DW_BRIDGE_BUILT,
    [string]$SaveStateFile = $env:DW_SAVE_STATE_FILE
)

if (-not $Scene) { $Scene = "Castle1F" }
if (-not $Tile) { $Tile = "8,8" }
if (-not $Gold) { $Gold = "120" }

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

$ArgsList = @("--path", "`"$ProjectDir`"", "res://scenes/DebugLaunch.tscn", "--", "--scene", $Scene, "--tile", $Tile, "--gold", $Gold)

if ($Facing) { $ArgsList += @("--facing", $Facing) }
if ($From) { $ArgsList += @("--from", $From) }
if ($Items) { $ArgsList += @("--items", $Items) }
if ($AllChests) { $ArgsList += @("--all-chests", $AllChests) }
if ($UnlockedDoors) { $ArgsList += @("--unlocked-doors", $UnlockedDoors) }
if ($Monster) { $ArgsList += @("--monster", $Monster) }
if ($HeroName) { $ArgsList += @("--hero-name", $HeroName) }
if ($HeroLevel) { $ArgsList += @("--hero-level", $HeroLevel) }
if ($HeroHp) { $ArgsList += @("--hero-hp", $HeroHp) }
if ($HeroHpMax) { $ArgsList += @("--hero-hp-max", $HeroHpMax) }
if ($HeroMp) { $ArgsList += @("--hero-mp", $HeroMp) }
if ($HeroMpMax) { $ArgsList += @("--hero-mp-max", $HeroMpMax) }
if ($HeroStr) { $ArgsList += @("--hero-str", $HeroStr) }
if ($HeroAtk) { $ArgsList += @("--hero-atk", $HeroAtk) }
if ($HeroDef) { $ArgsList += @("--hero-def", $HeroDef) }
if ($HeroAgl) { $ArgsList += @("--hero-agl", $HeroAgl) }
if ($HeroExp) { $ArgsList += @("--hero-exp", $HeroExp) }
if ($HeroSpells) { $ArgsList += @("--hero-spells", $HeroSpells) }
if ($HeroWeapon) { $ArgsList += @("--hero-weapon", $HeroWeapon) }
if ($HeroArmor) { $ArgsList += @("--hero-armor", $HeroArmor) }
if ($BridgeBuilt) { $ArgsList += @("--bridge-built", $BridgeBuilt) }

if ($SaveStateFile) {
    $env:DW_SAVE_STATE_FILE = $SaveStateFile
    Write-Host "Using save state override: $SaveStateFile"
}

Write-Host "Launching debug: scene=$Scene tile=$Tile facing=$Facing gold=$Gold from=$From"
Start-Process -FilePath $Godot -ArgumentList $ArgsList
