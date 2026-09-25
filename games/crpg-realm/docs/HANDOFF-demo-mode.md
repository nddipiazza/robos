# Handoff: Expanded Demo Mode for robos-crpg

Read `games/crpg-realm/AGENTS.md` first: test pyramid, scenario engine, KGraph scenario and map types, blockout maps, browser build.

**Nothing from this session is committed yet.** That covers the scenario engine, the KGraph types, the blockout map library, the browser build, and the expanded demo mode. Run `git status` to see it all. Commit and push only when the user asks.

## Overview & Architecture

Demo mode provides an in-game execution environment for the entire RobOS cRPG test pyramid, running seamlessly in both native desktop Godot (`~/apps/godot4`) and web export (`build/web/`).

### Dual Modes
1. **Demo Arena (`Mode.DEMO` / "🎭 Mode: Demo Arena"):**
   - Runs the engine scenarios (`tests/e2e/features/engine/`) in the isometric `ScenarioArena.tscn` using `EngineSteps.gd`.
   - Visualizes dice rolls, initiative order, combatants, SMR outcomes, and step audits.
2. **Real Mode (`Mode.REAL` / "🎮 Mode: Real cRPG"):**
   - Runs full campaign playthroughs (`tests/e2e/features/full_playthroughs/`) and scene tests (`normal/`, `spells/`) directly in the **real Godot game scenes** (`CharacterSelect.tscn`, `Homestead.tscn`, `VillageSquare.tscn`, `GarrisonKeep.tscn`, `TacticalBattle.tscn`, `VictoryScreen.tscn`) using `RealSteps.gd`.
   - Simulates human/AI player inputs (character creation, walking, looting chest, dialogue choices, shopping, RTwP tactical pause, casting spells, ranged attacks, and Malakor boss fight).

### Persistent Demo Architecture (`DemoController.gd`)
- Registered as an Autoload in `project.godot`: `DemoController="*res://scripts/demo/DemoController.gd"`.
- Survives `get_tree().change_scene_to_file(...)` calls across all game scenes.
- Operates at `CanvasLayer` layer `124` (beneath `QAOverlay` at layer `125` so the virtual cursor and top HUD stay crisp on top).
- Seamlessly manages scene switching between `res://scenes/DemoMode.tscn` (Demo Arena) and the real campaign scenes.

### Interactive Controls & Pacing
- **Mode Toggle:** `[ 🎭 Mode: Demo Arena ]` ⇄ `[ 🎮 Mode: Real cRPG ]` button (Hot key: `M`). Automatically switches scenes and updates runnable test catalog.
- **Round Speed / Combat Timer Controls:**
  - Default combat pacing slowed down 2x (`1.4s/turn`, `1.8s/action`).
  - `🐢 Slower` button (Hot keys: `[` or `-`).
  - `HSlider` range: `0.4s` to `6.0s`, step `0.2s`.
  - `Faster 🐇` button (Hot keys: `]` or `+`).
  - Live readout: `%.1fs/turn`.
- **Global Speed:** `Speed 1x` cycle button (`0.25x`, `0.5x`, `1x`, `2x`, `4x`) and Hot keys `1`–`5`.
- **Navigation:** `⏮ Prev` (Hot key: `Left`), `⏸ Pause` / `▶ Play` (Hot key: `Space`), `Next ⏭` (Hot key: `Right`).
- **Test Pyramid Drawer:** `☰ Test pyramid` button (Hot key: `T`). Shows tests across Playthroughs, Scene tests, and Engine base. Clicking any test in either mode automatically loads the appropriate scene and plays that test.
- **Exit Demo:** `✕ Exit demo` button (Hot key: `Esc`). Gracefully cleans up and returns to `CharacterSelect.tscn`.

### Entry Points
- **Character Select UI:** Top-right buttons `🎭 Demo Arena` and `🎮 Real cRPG Demo`.
- **CLI Arguments:**
  - `~/apps/godot4 --path . --demo`: launches in Demo Arena mode.
  - `~/apps/godot4 --path . --real-demo` (or `--demo=real`): launches in Real cRPG mode.
- **Web URL Query Params:**
  - `?demo`: launches in Demo Arena mode.
  - `?real` (or `?demo=real`): launches in Real cRPG mode.

## Verified Test Suites

1. **In-Game Parity Check:**
   - `CRPG_MODE=backend python3 -m behave tests/e2e/features/engine/12_in_game_runner_parity.feature`: PASSED (0 failures).
2. **Full Engine Suite & Coverage Gate:**
   - `CRPG_MODE=backend python3 -m behave tests/e2e/features/engine`: 13 features, 225 scenarios, 1517 steps passed (0 failures).
3. **Blockout Unit Tests:**
   - `cd packages/robos-crpg-blockout && python3 -m unittest discover -s tests`: 18/18 passed.
4. **Web Export Build:**
   - `./export_web.sh`: Built `build/web/` and `build/realm-of-heroes-web.zip` (49M) including all `.feature` files and demo scripts.
5. **Live Godot Desktop (`DISPLAY=:0`):**
   - Verified live execution, Mode toggle, round speed controls, and exit on AMD Vega 10 GPU.

## Useful Commands

```bash
cd games/crpg-realm
# Launch native Godot in Demo Arena mode
DISPLAY=:0 ~/apps/godot4 --path . --demo

# Launch native Godot in Real cRPG Mode
DISPLAY=:0 ~/apps/godot4 --path . --real-demo

# Run headless engine parity check
CRPG_MODE=backend python3 -m behave tests/e2e/features/engine/12_in_game_runner_parity.feature

# Build web export package
./export_web.sh
```
