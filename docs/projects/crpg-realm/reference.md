---
title: Reference
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 3
description: "Lookup tables for Realm of Heroes: repository layout, autoloads, data files, scenes, HTTP control API, CLI scripts and environment variables."
---

# Reference
{: .no_toc }

Lookup tables for `games/crpg-realm`. For explanations, follow the links into the guides.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Repository layout

```text
games/crpg-realm/
├── project.godot            # Godot 4.3, GL Compatibility, 1920×1080, autoloads, main scene
├── play.sh                  # run the game (Character Select)
├── debug.sh                 # run a specific scene: ./debug.sh --scene <Name|res://path>
├── run_cucumber_tests.py    # BDD runner: --normal | --spells | --playthrough | --all
├── scenes/                  # 12 top-level scenes (locations, hero, battle, menus)
│   └── components/          # 17 reusable scenes: DoorPortal, Trap, TacticalEnemy, NPCCharacter, …
├── scripts/                 # GDScript for every scene and component
├── src/generated/v1/        # DataStoreV1.gd + typed wrappers (ItemData, MonsterData, NPCData, SpellData)
├── data/v1/                 # game content as JSON arrays
├── schemas/v1/              # 3 JSON Schemas (game, monsters, races)
├── mods/                    # bundled mods (catacomb-traps-mod)
├── shaders/                 # fog_of_war.gdshader
├── assets/                  # sprites, maps, icons, audio
├── qa_player/               # Python scripted player used by playthrough tests
└── tests/
    ├── e2e/features/        # normal/ (17), spells/ (24), full_playthroughs/ (6), steps/, environment.py
    └── *.gd, TestRunner.tscn  # GDScript unit tests
```

## Autoloads

Declared in `project.godot` and available everywhere by name.

| Name | Script | Role |
|:---|:---|:---|
| `DataStore` | `src/generated/v1/DataStoreV1.gd` | Loads `data/v1/*.json` and mods into dictionaries keyed by `id`. |
| `GameState` | `scripts/GameState.gd` | Party, inventory, equipment, gold, quests, flags, pause, formations, spawn position. |
| `GameControlServer` | `scripts/GameControlServer.gd` | Local HTTP API used by the tests and the QA player. |
| `AudioManager` | `scripts/AudioManager.gd` | Music and SFX by key; unknown keys do nothing. |
| `QAOverlay` | `scripts/QAOverlay.gd` | Visible test cursor, click pings and the scenario splash banner. |
| `FloatingTextManager` | `scripts/FloatingTextManager.gd` | Damage and heal numbers over characters. |

{: .note }
`CombatManager` is **not** an autoload. Each location scene has its own `CombatManager` child node, reached with `$CombatManager`. See [Godot 4 Architecture]({{ '/projects/crpg-realm/create-your-own-game/01-godot-architecture.html' | relative_url }}).

## Scenes

| Scene | Purpose |
|:---|:---|
| `CharacterSelect.tscn` | **Main scene.** Pick race (9) and class (12). |
| `Homestead.tscn` | Act 1. |
| `VillageSquare.tscn` | Act 2, the hub (2560×1440). |
| `WhisperingForest.tscn` | Act 3. |
| `AncientCatacombs.tscn` | Act 4. |
| `GarrisonKeep.tscn` | Act 5, the Captain Malakor fight. |
| `VictoryScreen.tscn` | End screen. |
| `TacticalBattle.tscn` | Arena used by the combat, aggro and spell tests. |
| `HeroPlayer.tscn`, `PartyCompanion.tscn`, `ShadowHound.tscn` | Actors instanced into locations. |
| `Main.tscn` | Early combat prototype. No other scene or script loads it. |

## Data files (`data/v1/`)

Every file except `game.json` is a **JSON array of objects with an `id`**.

| File | Records | Read by gameplay code? |
|:---|---:|:---|
| `game.json` | object | Loaded into `DataStore.game_config`, not read |
| `races.json` | 9 | Loaded, not read. Racial bonuses are hard-coded in `CharacterSelect.gd` |
| `classes.json` | 12 | Loaded, not read. Class stats are hard-coded in `GameState.init_hero` |
| `spells.json` | 26 | Loaded, not read. Spell behaviour is a `match` on the id in `CombatManager.gd` |
| `items.json` | 46 | **Yes**: inventory, equipment, shop, loot |
| `monsters.json` | 6 | Loaded, not read. `TacticalEnemy` and the Malakor fight use their own numbers |
| `npcs.json` | 18 | **Yes**: `NPCCharacter` names and dialogue lookup |
| `dialogue.json` | 18 | **Yes**: dialogue trees (`DataStore.dialogue_trees`) |
| `traps.json` | 4 | **Yes**: overrides `Trap.tscn` exports by `trap_id`; mods can add more |
| `quests.json` | 1 | Loaded, not read |
| `zones.json` | 3 | Loaded, not read |
| `encounters.json` | 2 | Not loaded |
| `status_effects.json` | 17 | Not loaded |

Details and gotchas: [Game Creation Process]({{ '/projects/crpg-realm/game-creation-process.html' | relative_url }}).

{: .warning }
Don't run `packages/crpg-builder generate` over this game. It rewrites `DataStoreV1.gd` without trap and mod loading, and also overwrites `data/v1/*.json` and `project.godot`.

## HTTP control API

`GameControlServer` listens on `127.0.0.1`. The port comes from `CRPG_WEB_SERVICE_PORT`, then `--port N` / `--port=N`, and defaults to **8080**. If the port is busy it tries the next nine. The test harness uses **18090**. Every route also works without the `/api/v1` prefix.

| Method | Path | Purpose |
|:---|:---|:---|
| GET | `/api/v1/health` | `{status, game, engine, port}` |
| GET | `/api/v1/state` | Full game state as JSON |
| GET | `/api/v1/screen_state` | What is currently on screen |
| GET | `/api/v1/action_log` | Activity log contents |
| GET | `/api/v1/combat/round_stats`, `/api/v1/combat/turn_events` | Combat telemetry |
| POST | `/api/v1/action` | Named game actions, such as `move_to`, `move_party_formation`, `set_party_leader`, `cast_spell`, `disarm_trap`, `set_detect_traps`, `toggle_pause`, `confront_malakor` |
| POST | `/api/v1/setup_state` | Jump to a scene and inject party, items and flags for a test |
| POST | `/api/v1/reset` | Back to Character Select with a default fighter (ignores the body) |
| POST | `/api/v1/dialog/choice` | Pick a dialogue reply |
| POST | `/api/v1/user_input/*` | Simulated input: `mouse_click`, `click_button`, `click_object`, `type_text`, `move_to`, `move_to_target`, `interact_target`, `select_option`, `pan_camera`, `center_camera`, `inventory/toggle`, `inventory/use_item`, `inventory/equip_item`, `action_log/set_size` |
| POST | `/api/v1/qa/*` | Test helpers: `scenario_splash`, `set_step`, `give_item` |

The full action list and request bodies are in [Infinity AI Agent & BDD Harness]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }}).

## Command-line scripts

| Command | What it does |
|:---|:---|
| `./play.sh [godot args]` | Runs the project from Character Select. |
| `./debug.sh --scene <Name or res:// path> [godot args]` | Runs one scene. Short names: `Homestead`, `VillageSquare`, `GarrisonKeep`, `VictoryScreen`, `TestRunner`. |
| `python3 run_cucumber_tests.py [suite] [feature…] [behave args]` | Suites: `--normal` (also `--isolated`, the default), `--spells` (`--spell`, `--magic`), `--playthrough` (`--playthroughs`, `--full`), `--all` (`--both`). |
| `python3 tests/validate_schemas.py` | Checks that the data files parse and spot-checks a few values. It doesn't use the JSON Schemas. |

## Environment variables

| Variable | Used by | Default |
|:---|:---|:---|
| `GODOT_BIN` | `play.sh`, `debug.sh`, test harness | auto-detect (`~/apps/godot4`, `godot4`, `godot`) |
| `CRPG_WEB_SERVICE_PORT` | game, test harness | 8080 in the game, 18090 in tests |
| `USE_XVFB` | test harness | `1` |
| `CRPG_DISPLAY` / `XVFB_DISPLAY` | test harness | `:99` |
| `XVFB_BIN`, `FFMPEG_BIN` | test harness | auto-detect |
| `REPORTS_DIR` | `tests/e2e/features/environment.py` only | `tests/e2e/reports` (the runner and report generator ignore it) |

## Test suites

| Suite | Folder | Features | Scenarios |
|:---|:---|---:|---:|
| Normal (isolated mechanics) | `tests/e2e/features/normal/` | 17 | 41 |
| Spells | `tests/e2e/features/spells/` | 24 | 27 |
| Full playthroughs | `tests/e2e/features/full_playthroughs/` | 6 | 7 |
| **Total** | | **47** | **75** |

Scenario counts are written scenarios. One Scenario Outline expands to more runs.
