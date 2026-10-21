---
name: debug-launcher
description: Guidelines, CLI flags, environment variables, GUI launcher instructions, and test runner workflows for debugging Dragon Warrior scenes and state.
---

# 🚀 Debug Launcher & Testing Skill

Use this skill when running, debugging, or verifying scenes, hero states, monster battles, or E2E tests in the Dragon Warrior Godot project.

## 🎯 Quick Scene Launching (`debug.sh` / `debug.ps1`)

Instead of navigating from the main title screen, use the platform debug launcher script, which boots via `res://scenes/DebugLaunch.tscn` + `scripts/DebugLaunch.gd` to inject custom Hero, inventory, and map state:

### Linux / macOS / WSL
```bash
./debug.sh --scene Castle1F --tile 8,8 --facing up --gold 120 \
  --items "Herb;Torch" --hero-level 5 --hero-hp 20 --hero-hp-max 20 \
  --hero-spells "heal;hurt" --hero-weapon copper_sword --hero-armor chain_mail
```

### Windows PowerShell
```powershell
.\debug.ps1 -Scene Castle1F -Tile 8,8 -Facing up -Gold 120 -Items "Herb;Torch" -HeroLevel 5 -HeroHp 20 -HeroHpMax 20 -HeroSpells "heal;hurt" -HeroWeapon copper_sword -HeroArmor chain_mail
```

---

## 🚩 Available CLI Flags & Environment Variables

Every CLI flag has a corresponding `DW_*` environment variable (`DW_SCENE`, `DW_TILE`, `DW_GOLD`, `DW_HERO_LEVEL`, etc.):

- **`--scene`** (`DW_SCENE`): Scene name (e.g. `Castle1F`, `WorldMap`, `BattleTest`).
- **`--tile`** (`DW_TILE`): Starting coordinates formatted as `X,Y` (e.g. `8,8`).
- **`--facing`** (`DW_FACING`): `up`, `down`, `left`, `right`.
- **`--gold`** (`DW_GOLD`): Hero starting gold count.
- **`--items`** (`DW_ITEMS`): Semicolon-separated item names (e.g. `"Herb;Torch;Magic Key"`).
- **`--from`** (`DW_FROM`): Scene ID to emulate coming from.
- **`--all-chests`** (`DW_ALL_CHESTS`): Semicolon-separated opened chest IDs.
- **`--unlocked-doors`** (`DW_UNLOCKED_DOORS`): Semicolon-separated unlocked door IDs.
- **`--monster`** (`DW_MONSTER`): Monster key for `BattleTest` scene (e.g. `axe_knight`, `slime`).
- **`--hero-name`** (`DW_HERO_NAME`): Hero name string.
- **`--hero-level`** (`DW_HERO_LEVEL`), **`--hero-hp`**, **`--hero-hp-max`**, **`--hero-mp`**, **`--hero-mp-max`**, **`--hero-str`**, **`--hero-atk`**, **`--hero-def`**, **`--hero-agl`**, **`--hero-exp`**.
- **`--hero-spells`** (`DW_HERO_SPELLS`): Semicolon-separated spell IDs (e.g. `"heal;hurt"`).
- **`--hero-weapon`** (`DW_HERO_WEAPON`), **`--hero-armor`** (`DW_HERO_ARMOR`).
- **`--bridge-built`** (`DW_BRIDGE_BUILT`): `true`/`false` flag for rainbow bridge overworld state.
- **`--save-state-file`** (`DW_SAVE_STATE_FILE`): Path to JSON save-state file under `data/v1/save-states/`.

---

## 💻 Interactive GUI Launcher (`launcher.sh` / `launcher.ps1`)

Launch the Electron GUI launcher to click presets or select save states:

```bash
./launcher.sh    # Linux/macOS/WSL
.\launcher.ps1   # Windows PowerShell
```

To add custom preset buttons, edit the preset array in `tools/debug-launcher/renderer/app.js`.

---

## ⚔️ Isolated Battle Simulation

To test battle mechanics or monster encounters directly without random overworld steps:

```bash
./debug.sh --scene BattleTest --monster axe_knight --hero-level 15 --hero-hp 80 --hero-hp-max 80
```

---

## 🧪 E2E Cucumber / Behave Test Suite

To run the automated BDD test suite:

```bash
python run_cucumber_tests.py
```

### Re-importing Assets
After modifying imported assets or terrain maps, run:
```bash
godot --import --quit --path .
```
