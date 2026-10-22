# 🐉 Dragon Warrior (NES) — AI Agent Guidelines & Rules

Welcome! This repository contains a fan recreation of the original **Dragon Warrior (Dragon Quest I)** for NES in **Godot 4** (GL Compatibility renderer).

This file (`AGENTS.md`) is the canonical, generic entry point for **all AI coding tools and assistants** (Antigravity, Cursor, Windsurf, Claude Code, GitHub Copilot, OpenAI Codex, etc.) operating within this repository.

---

## 🏗️ Project Architecture & Tech Stack

- **Engine**: Godot 4.5+ (GL Compatibility profile).
- **Primary Logic**: GDScript (statically typed where possible).
- **Data Architecture**:
  - JSON game data located under `data/v1/`.
  - JSON Schemas located under `schemas/v1/`.
  - Generated GDScript data models located under `src/generated/v1/`.
- **E2E Testing**: Python 3.12+ with `behave` (BDD/Cucumber framework) and FFmpeg for video recording.
- **Entry Point**: `project.godot` (`scenes/main/Main.tscn` -> Title Screen -> Save Select -> Game Flow).

---

## 📜 GDScript & Coding Conventions

1. **Type Safety**:
   - Use explicit type annotations for parameters, return types, and member variables (e.g., `var hero_hp: int = 100`, `func calc_damage(attacker: MonsterData) -> int:`).
2. **Naming Conventions**:
   - **Files & Scenes**: `PascalCase.tscn`, `PascalCase.gd` (e.g., `Castle1F.tscn`, `HeroState.gd`).
   - **Node Names**: `PascalCase` matching scene/type where applicable.
   - **Functions & Variables**: `snake_case` (e.g., `func update_player_position()`).
   - **Constants & Enums**: `ALL_CAPS` (e.g., `enum Direction { UP, DOWN, LEFT, RIGHT }`).
3. **Data Classes**:
   - Do NOT edit files under `src/generated/v1/` directly! They are auto-generated from JSON Schemas in `schemas/v1/` using `./generate-schema-classes.sh`.
4. **Node Path & Lifecycle Safety**:
   - Use `onready` or `_ready()` for node references.
   - Always verify non-null states or node presence before accessing child properties.

---

## 🛠️ Task-Specific Skills Index (`.agents/skills/`)

Consult the matching skill document under `.agents/skills/<skill-name>/SKILL.md` before implementing feature changes:

| Task / Domain | Skill Location | Description |
|---|---|---|
| **Debug Launcher & Testing** | [debug-launcher](file://.agents/skills/debug-launcher/SKILL.md) | Debug launcher flags, test runner, scene presets, isolated battle simulation |
| **Game Data Pipeline** | [game-data-pipeline](file://.agents/skills/game-data-pipeline/SKILL.md) | Schema validation, runtime vs reference datasets, GDScript class generator |
| **Add Items & Equipment** | [add-item-or-equipment](file://.agents/skills/add-item-or-equipment/SKILL.md) | Consumables, key items, weapons, armor, shields, and equip workflows |
| **Add Locked Door** | [add-locked-door](file://.agents/skills/add-locked-door/SKILL.md) | Key consumption and locked door interaction handling |
| **Add Monster & Encounter** | [add-monster-encounter](file://.agents/skills/add-monster-encounter/SKILL.md) | Monster stats, battle test harness, encounter zones & rates |
| **Add NPC & Dialogue** | [add-npc-dialogue](file://.agents/skills/add-npc-dialogue/SKILL.md) | NPC sprite placement, facing, dialogue pagination across scene types |
| **Add Shop or Inn** | [add-shop](file://.agents/skills/add-shop/SKILL.md) | Weapon/armor shops, tool shops, key shops, inn pricing & recovery |
| **Add Spell** | [add-spell](file://.agents/skills/add-spell/SKILL.md) | Combat formulas, spell definitions, MP costs, overworld/battle spell handlers |
| **Add Treasure Chest** | [add-treasure-chest](file://.agents/skills/add-treasure-chest/SKILL.md) | Chest searching, looting logic, tile blitting, opened-state persistence |
| **Associate Music to Map** | [associate-music-to-map](file://.agents/skills/associate-music-to-map/SKILL.md) | Setting BGM tracks per map scene and audio stream setup |
| **Create Dungeon Floor** | [create-new-dungeon-floor](file://.agents/skills/create-new-dungeon-floor/SKILL.md) | Extending `DungeonMap.gd`, PNG image sampling, stair linkage setup |
| **Create New Map** | [create-new-map](file://.agents/skills/create-new-map/SKILL.md) | Standalone map scene creation, spawn positioning, edge transitions |
| **Sprite & Character Setup** | [sprite-and-character-setup](file://.agents/skills/sprite-and-character-setup/SKILL.md) | Character sprite sheet indexing (`NPCCharacterData`), walk animation frames |
| **Tilemap & Walkability** | [tilemap-walkability](file://.agents/skills/tilemap-walkability/SKILL.md) | `MAP_GRID` arrays vs color-sampled overworld terrain mask generation |

---

## 🧪 Testing & Debug Workflows

### 1. Launching Full Game
- Windows PowerShell: `.\play.ps1`
- Bash (Linux/macOS/Git Bash): `./play.sh`

### 2. Debug Launcher & Isolated Scene Testing
- Fast-load into specific scenes/battles with custom Hero states:
  - PowerShell: `.\debug.ps1 -Scene Castle1F -Tile 8,8 -Facing up -Gold 120 -Items "Herb;Torch"`
  - Bash: `./debug.sh --scene Castle1F --tile 8,8 --facing up --gold 120 --items "Herb;Torch"`
- Battle Testing:
  - PowerShell: `.\debug.ps1 -Scene BattleTest -Monster axe_knight -HeroLevel 15`
  - Bash: `./debug.sh --scene BattleTest --monster axe_knight --hero-level 15`

### 3. Running E2E Cucumber Tests
- Run Python test suite:
  ```bash
  python run_cucumber_tests.py
  ```

### 4. AI Full-Game Playthrough ("play the game" mode)
- `src/systems/PlayGameBrain.gd` is the robos-jrpg brain that plays the **whole game as a user would**: it only
  presses real game inputs and reads state through the IPC web service (`GameControlServer.gd`, `/api/v1/state`).
  It continuously seeks the next entry of the ordered milestone registry `data/v1/milestones.json`
  (every weapon/armor/shield purchase, every treasure chest, each quest item, level gates, Dragonlord, ending).
- Regenerate milestones after changing shops, chests or quests: `python3 tools/gen_milestones.py`.
- Drive it from Python (the driver is the user: no teleports, no stat edits; it asserts invariants such as
  "hero never stands on water" and writes `tests/e2e/reports/playthrough/playthrough.json` + screenshots):
  ```bash
  python3 tests/e2e/play_full_game.py                 # whole game, headless (~2-3 h at time-scale 6)
  python3 tests/e2e/play_full_game.py --until 18      # stop after milestone 18
  DW_HEADED=1 python3 tests/e2e/play_full_game.py     # watch it on the desktop
  python3 tests/e2e/play_full_game.py --record        # + reports/playthrough/playthrough.mp4 and a 12x time-lapse
  python3 tests/e2e/play_full_game.py --stepped       # one video + save checkpoint per milestone (videos/NN-<id>.mp4)
  python3 tests/e2e/play_full_game.py --stepped --only 42   # replay milestone 42 from checkpoints/41-<id>.json
  python3 tests/e2e/play_full_game.py --stepped --from 42   # resume from checkpoint 41 to the end
  ```
- `--stepped` cuts the ffmpeg capture at every milestone (`reports/playthrough/videos/NN-<id>.mp4`) and saves the
  game via `export_save_state` to `reports/playthrough/checkpoints/NN-<id>.json`; `--from`/`--only` load that
  checkpoint with `load_save_state` and start the brain at the matching milestone id, so a single milestone can be
  re-recorded in seconds instead of re-running the ~2 h game.
- `--stepped`/`--record` runs also start the **playthrough dashboard** (`tools/playthrough-dashboard`, Electron;
  `--dashboard on|off|auto`, `DW_DASHBOARD`): a GNOME tray icon whose progress ring and context menu follow the run
  (status, milestones, level, battles, deaths, current objective; stop the run; open the latest video) and a window
  with live IPC game state (stats, battle, pack, AI inputs, brain event log, 1.5 s screenshots via
  `capture_screenshot`) plus the milestone list, where each finished milestone is clickable and plays its
  `videos/NN-<id>.mp4` with the checkpoint summary. The driver feeds it through
  `reports/playthrough/live.json` (rewritten once a second); the dashboard also runs standalone:
  `cd tools/playthrough-dashboard && npm install && npx electron --no-sandbox . [--reports DIR] [--port N]`
  (`--snapshot out.png` / `--select N` are debug aids for headless agents). It stays open after the run — quit it
  from the tray menu.
- Deadlock detection runs on both sides: the brain's progress watchdog (`PlayGameBrain._check_progress_watchdog`,
  wall-clock, 90 s without any change in milestone/battles/level/gold/map/tile/herbs/HP) drops the current objective
  and plan, blacklists an unreachable supply shop, and after 3 stalls on one milestone skips it (optional) or fails
  the run; the driver's `--stall-timeout` (default 600 s, `DW_STALL_TIMEOUT`) ends the run with status `stalled`,
  `screenshots/stall.png` and the AI log tail when done/battles/level/gold/exp stop changing.
- IPC commands: `start_play_game {time_scale, from_milestone}`, `stop_play_game`, `get_milestones` (report with
  `status`, `index`, `done`, `skipped`, `battles`, `deaths` and the brain's event log), `export_save_state` /
  `load_save_state {file_path}`.
- Survival rules live in `PlayGameBrain._decide_survival` / `_decide_battle` (kill-before-die battle policy,
  zone-aware heal thresholds, tiered healing (HEAL/herb/HEALMORE by incoming damage), MP conservation inside
  Charlock, HEALMORE-only boss healing, a Charlock MP commit bar with wings home to rest when short, herb restock
  from every item shop listed in `milestones.json` `item_shops`, and NES pack rules: 8 tool slots, six per
  consumable stack, no dropping). Each death outside grinding raises the current milestone's required level by one.
  Bugs the brain exposes are almost always *game* bugs — fix the game, not the brain.

---

## 🔄 Schema & Data Model Regeneration

When modifying schemas in `schemas/v1/`, regenerate the GDScript data models immediately:
```bash
./generate-schema-classes.sh
```
*(Requires Node.js 20+)*

---

## 🛠️ General Agent Guidelines

1. **Verification**: Always run appropriate tests or launch commands (`debug.ps1`/`debug.sh` or `run_cucumber_tests.py`) to verify changes before marking a task complete.
2. **Schema Integrity**: Ensure all data modifications adhere to the v1 JSON Schemas.
3. **No Hidden Side Effects**: Keep changes localized and preserve existing function signatures across scenes and scripts.
