---
title: CRPG reference
layout: default
parent: Realm of Heroes CRPG
grand_parent: Projects
nav_order: 3
description: Lookup tables for games/crpg-realm - repository layout, autoloads, data and JSON-LD content files, the HTTP control API, scripts and environment variables.
redirect_from:
  - /projects/crpg-realm/game-creation-process.html
---

# CRPG reference
{: .no_toc }

Lookup tables for `games/crpg-realm`. For explanations, follow the links to the guides.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Repository layout

```text
games/crpg-realm/
  project.godot        Godot 4.3, GL Compatibility, 1920x1080, autoloads, main scene
  play.sh              run the game (Character Select)
  debug.sh             run one scene: ./debug.sh --scene <Name or res:// path>
  export_web.sh        browser build into build/web/ and a zip
  run_cucumber_tests.py  BDD runner
  AGENTS.md            notes for agents that change the game or its tests
  scenes/              16 top-level .tscn scenes, 4 .jsonld scene files
    components/        18 reusable scenes: DoorPortal, Trap, TacticalEnemy, NPCCharacter, ...
  scripts/             GDScript for scenes and components; engine/ and demo/ subfolders
  src/generated/v1/    DataStoreV1.gd and typed wrappers (ItemData, MonsterData, NPCData, SpellData)
  data/v1/             game content as JSON arrays
  schemas/v1/          3 JSON Schemas (game, monsters, races)
  campaigns/ characters/ items/ enemies/ spells/ abilities/ events/ maps/
                       KGraph JSON-LD content authored in the editor
  cartridges/          bundled campaigns (*.cartridge.json)
  scenarios/           robos:CRPGTestScenario files for the Infinity AI engine
  mods/                drop-in mods (catacomb-traps-mod)
  shaders/             fog_of_war.gdshader
  assets/              sprites, 3D models (.glb), backgrounds, blockouts, icons, audio
  qa_player/           Python scripted player used by some tests
  tests/               GDScript tests, e2e/features (behave), validate_schemas.py
```

## Autoloads

Declared in `project.godot`. They exist for the whole run and survive scene changes.

| Name | Script | Role |
|:---|:---|:---|
| `DataStore` | `src/generated/v1/DataStoreV1.gd` | Loads `data/v1/*.json` and mods into dictionaries keyed by `id` |
| `GameState` | `scripts/GameState.gd` | Party, inventory, equipment, gold, quests, flags, pause, formations, spawn position |
| `GameControlServer` | `scripts/GameControlServer.gd` | Local HTTP API used by the tests |
| `AudioManager` | `scripts/AudioManager.gd` | Music and sound effects by key. Unknown keys do nothing. |
| `QAOverlay` | `scripts/QAOverlay.gd` | Test cursor, click pings, scenario splash, step banner |
| `FloatingTextManager` | `scripts/FloatingTextManager.gd` | Damage and heal numbers |
| `Dice` | `scripts/engine/Dice.gd` | Seeded dice, scripted rolls, roll log |
| `ScenarioEngine` | `scripts/engine/ScenarioEngine.gd` | Data-driven rules core and the Infinity AI |
| `DemoController` | `scripts/demo/DemoController.gd` | In-game demo mode |
| `CartridgeManager` | `scripts/engine/CartridgeManager.gd` | Finds, inserts and starts cartridges |

`CombatManager` is not an autoload. Each hand-built location scene has a child node named `CombatManager`, which scripts reach with `$CombatManager`.

## Two content systems

The game has two ways to describe content, and they do not share a loader.

1. `data/v1/*.json` files are JSON arrays of objects with an `id`. `DataStore` loads them for the hand-built scenes. `ScenarioEngine` reads a subset for the rules engine.
2. KGraph JSON-LD files in `campaigns/`, `characters/`, `items/`, `enemies/`, `spells/`, `abilities/`, `events/` and `maps/` are what the [campaign editor]({{ '/projects/crpg-realm/campaign-editor-tutorial.html' | relative_url }}) reads and writes. The cartridge bundler compiles them into `cartridges/*.cartridge.json`, which `CartridgeWorld` plays.

### data/v1 files
{: #data-v1-files }

| File | Records | Read by |
|:---|---:|:---|
| `game.json` | object | `DataStore.game_config`; nothing reads it |
| `races.json` | 9 | `ScenarioEngine`. `DataStore` loads it, but character creation hard-codes racial bonuses in `CharacterSelect.gd`. |
| `classes.json` | 12 | `ScenarioEngine`. Hand-built scenes hard-code class HP and AC in `GameState`. |
| `spells.json` | 26 | `ScenarioEngine` (the `mechanics` block). Hand-built scenes resolve spells in `CombatManager.gd` by id. |
| `items.json` | 50 | Both: inventory, shops and loot in the scenes; `armorType`, `rangeFeet`, `use` and `grants` in `ScenarioEngine` |
| `monsters.json` | 6 | `ScenarioEngine`. `TacticalEnemy` and the Malakor fight use their own numbers. |
| `npcs.json` | 18 | `NPCCharacter` (dialogue lookup) |
| `dialogue.json` | 18 | `NPCCharacter` and the scene scripts, through `DataStore.dialogue_trees` |
| `traps.json` | 4 | `Trap.gd` (overrides the node's exports by `trap_id`) and `ScenarioEngine` |
| `status_effects.json` | 17 | `ScenarioEngine` (conditions) |
| `quests.json` | 4 | `GameState.load_campaign_state()` reads it directly when a campaign has no quest log. `DataStore` also loads it. |
| `zones.json` | 3 | Loaded by `DataStore`; no script reads it |
| `encounters.json`, `events.json` | 2, 19 | No script reads them |
| `active_campaign.json` | object | Written by the editor's **Render as Game**. `CharacterSelect.gd` and `GameControlServer.gd` read it as a fallback campaign. |

`ScenarioEngine` loads `spells`, `monsters`, `classes`, `races`, `items`, `traps` and `status_effects` (`CONTENT_KINDS` in `ScenarioEngine.gd`).

{: .warning }
Do not run `packages/crpg-builder` with `generate` or `create-game` against `games/crpg-realm`. Its default target is this folder, and it overwrites `data/v1/*.json`, `schemas/v1/`, `src/generated/v1/*.gd` (including `DataStoreV1.gd`, whose generated version has no trap or mod loading) and `project.godot`. The game was bootstrapped from the builder and then edited by hand. To try the builder, use `--target-dir` with a scratch folder. The builder reads the package at `.robos/kgraphs/crpg/package.jsonld`, which models only the original three-map slice.

![The four stages of the original game generation]({{ '/assets/images/crpg-realm/game_generation_paradigm.png' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The text on this page says what is built today: the game was bootstrapped from the builder and then edited by hand, so the data files and `DataStoreV1.gd` no longer match what it would generate.*

`python3 tests/validate_schemas.py` checks that ten data files parse and spot-checks a few records. It does not validate against the JSON Schemas, and `traps.json` is not in its list.

### KGraph JSON-LD folders

| Folder | Files | `@type` | Written by |
|:---|---:|:---|:---|
| `campaigns/` | 6 | `robos:CRPGCampaign` | editor, Campaign |
| `characters/` | 15 | `robos:CRPGCharacter` | editor, Characters & NPCs |
| `items/` | 13 | `robos:CRPGItem` | editor, Items |
| `enemies/` | 7 | `robos:CRPGMonster` | editor, Enemies |
| `spells/` | 26 | `robos:CRPGSpell` | editor, Spells |
| `abilities/` | 12 | `robos:CRPGAbility` | editor, Abilities |
| `events/` | 19 | `robos:CRPGGameEvent` | editor |
| `maps/` | 16 | `robos:CRPGBattleMap` | editor, Maps; `robos_crpg_blockout` adds the collision grid |
| `scenes/*.jsonld` | 4 | `robos:CRPGScene` | editor |
| `scenarios/` | 5 | `robos:CRPGTestScenario` | by hand; see [testing]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }}) |

A cartridge (`cartridges/<slug>.cartridge.json`) is one JSON object with the keys `crpgCartridgeVersion`, `cartridgeId`, `header`, `campaign`, `maps`, `characters`, `items`, `enemies`, `spells`, `quests` and `storyDAG`. The `header` has the title, slug, author, setting, counts, `startingMap` and `startingPosition`.

## HTTP control API

`GameControlServer` listens on `127.0.0.1`. The port defaults to 8080, is overridden by `CRPG_WEB_SERVICE_PORT`, and then by `--port N` or `--port=N`. If the port is busy it tries the next nine. The test harness uses 18090. There is no authentication. Browser builds do not start it.

Every route also answers without the `/api/v1` prefix, except `/scenario/*`, `/demo/*` and `/screenshot`, which exist only under `/api/v1`. Unknown routes return 404.

| Method | Path under `/api/v1` | Purpose |
|:---|:---|:---|
| GET | `/health` | `{status, game, engine, port}` |
| GET | `/state` | Full game state: scene, hero, party, inventory, quest stage, flags, dialogue, battle, traps, status effects, fog |
| GET | `/screen_state`, `/action_log` | What is on screen; the activity log |
| GET | `/combat/round_stats`, `/combat/turn_events` | Combat telemetry from the current scene |
| POST | `/action` | `{"action": "<name>", "args": {...}}`. Names are listed below. |
| POST | `/setup_state` | Load a scene with a given hero, party, inventory, gold, quest stage and flags |
| POST | `/reset` | Back to Character Select with a default fighter |
| POST | `/campaign/load` | Body `{"campaign": "<slug>"}`. Loads `campaigns/<slug>.jsonld` and its starting scene. |
| POST | `/dialog/choice` | Pick a dialogue reply |
| POST | `/user_input/<name>` | Simulated input: `mouse_click`, `click_button`, `click_object`, `type_text`, `move_to`, `move_to_target`, `interact_target`, `select_option`, `pan_camera`, `center_camera`, `inventory/toggle`, `inventory/use_item`, `inventory/equip_item`, `action_log/set_size` |
| POST | `/qa/<name>` | Test helpers: `scenario_splash`, `set_step`, `give_item`, `proof`, `proof_clear`, `cartridge_step` |
| GET, POST | `/cartridges`, `/cartridge/insert`, `/cartridge/embark` | List cartridges; insert one by `cartridge`, `id` or `slug`; start it |
| POST | `/engine/events` | Event log of the hand-built scenes since a sequence number |
| GET, POST | `/screenshot`, `/ui/glyphs` | Save a viewport PNG (`path` in the body, default `/tmp/godot_screenshot.png`); scan UI text for glyphs the font lacks |
| POST | `/scenario/load`, `/scenario/act`, `/scenario/input`, `/scenario/turn`, `/scenario/run`, `/scenario/patch`, `/scenario/dice`, `/scenario/events`, `/scenario/fuzz`, `/scenario/coverage/reset` | Drive the Infinity AI scenario engine |
| GET | `/scenario/state`, `/scenario/audit`, `/scenario/dice_log`, `/scenario/coverage`, `/scenario/content` | Read engine state, audit violations, roll log, coverage and content ids |
| POST | `/demo/start`, `/demo/toggle_mode`, `/demo/exit`, `/demo/run_all` | Start demo mode (`mode` 0 or 1), switch mode, leave it; run every engine scenario through the in-game runner |

The `/action` names are the branches of `_execute_game_action()` in `GameControlServer.gd`:

| Group | Actions |
|:---|:---|
| Movement and interaction | `move_to`, `move_to_target`, `move_hero`, `interact_target`, `click_object`, `talk_npc`, `pickup_item`, `enter_door`, `approach_enemy` |
| Dialogue and UI | `select_dialogue_choice`, `close_dialogue`, `scroll_action_log`, `open_character_status`, `close_character_status`, `toggle_pause`, `set_paused`, `set_fog_of_war`, `set_fog_of_war_radius`, `toggle_fog`, `set_map_fog`, `toggle_map_fog`, `action_toolbar_click` |
| Story and state | `embark`, `select_race`, `select_class`, `select_spell`, `reroll_stats`, `set_flag`, `advance_quest`, `add_quest`, `add_kill`, `add_inventory_item`, `change_scene`, `reenter_area`, `reload_current_scene`, `talk_partner`, `loot_footlocker`, `exit_to_village`, `talk_blacksmith`, `enter_garrison`, `confront_malakor`, `attack_malakor`, `defeat_malakor`, `end_game_victory` |
| Combat | `attack_target`, `attack_hound`, `ranged_attack`, `cast_spell`, `cast_fireball`, `use_fighter_ability`, `order_party_attack`, `taunt_enemy`, `handle_encounters`, `execute_combat_round`, `get_round_stats`, `enemy_strike`, `inflict_party_damage`, `set_party_member_hp`, `trigger_auto_heal`, `retry_encounter` |
| Items and shop | `equip_item`, `unequip_item`, `open_shop`, `close_shop`, `switch_shop_tab`, `buy_item`, `sell_item`, `loot_enemy_corpse` |
| Party | `select_party_member`, `select_all_party`, `set_party_leader`, `get_party_leader`, `set_party_formation`, `get_party_formation`, `move_party_formation` |
| Status and traps | `apply_status_effect`, `remove_status_effect`, `set_status_duration`, `dispel_magic`, `find_traps`, `set_detect_traps`, `reveal_trap`, `disarm_trap`, `trigger_trap` |
| Test fixtures | `start_tactical_battle`, `setup_goblin_crowd`, `setup_spell_encounter`, `start_golem_battle`, `simulate_golem_assault`, `set_enemy_hostility`, `set_enemy_position`, `set_ability_scores` |
| Cartridges | `start_auto_play`, `pause_auto_play`, `toggle_auto_play` |

{: .note }
The API is not pure input simulation. `mouse_click` pushes a real input event, but most handlers animate the cursor and then call game code directly, and `setup_state`, `qa/give_item` and the fixture actions change state outright.

## Scripts and commands

| Command | What it does |
|:---|:---|
| `./play.sh [godot args]` | Runs the project from Character Select |
| `./debug.sh --scene <name or res:// path> [godot args]` | Runs one scene |
| `./export_web.sh` | Browser build into `build/web/` and `build/realm-of-heroes-web.zip` |
| `python3 run_cucumber_tests.py [suite] [feature] [behave args]` | Suites: `--normal` (default; alias `--isolated`), `--spells` (`--spell`, `--magic`), `--playthrough` (`--playthroughs`, `--full`), `--scenarios` (`--scenario`, `--adventures`), `--engine`, `--all` (`--both`). Modifiers: `--backend` or `--fast`, `--human` or `--prove`. |
| `node packages/crpg-builder/bin/crpg-cartridge.js list` | List cartridges and campaigns. Other commands: `bundle <slug> [out]`, `bundle-all`, `inspect <slug>`. |
| `node --test tests/*.test.js` in `packages/crpg-builder` | Builder and cartridge tests |
| `python3 -m robos_crpg_blockout <command> <map.jsonld>` in `packages/robos-crpg-blockout` | Blockout map tool. The commands are `validate`, `build`, `check` and `render`. See its [README](https://github.com/nddipiazza/robos/blob/main/packages/robos-crpg-blockout/README.md). |
| `node games/crpg-realm/tests/e2e/validate_scenarios_kgraph.js <file.jsonld>...` | Check scenario files against the SHACL shapes |
| `npm start` in `packages/crpg-editor` | Start the campaign editor |

## Game command-line flags

| Flag or variable | Effect |
|:---|:---|
| `--cartridge <id>`, `--campaign <id>`; `CRPG_CARTRIDGE`, `CRPG_CAMPAIGN` | Insert and start a cartridge |
| `--map <slug>`, `--starting-map <slug>`; `CRPG_MAP` | Override the cartridge's starting map |
| `--auto-play`; `CRPG_AUTO_PLAY=1` | Start the cartridge in auto-play |
| `--demo`, `--real-demo` (`--demo=real`) | Start demo mode |
| `--port <n>`; `CRPG_WEB_SERVICE_PORT` | Control server port |

## Environment variables for tests

| Variable | Default | Used by |
|:---|:---|:---|
| `GODOT_BIN` | auto-detect (`~/apps/godot4`, `godot4`, `godot`, and a few fixed paths) | `play.sh`, `debug.sh`, test harness, editor |
| `CRPG_MODE` | `human` | Test harness. `backend` is headless with no video. |
| `CRPG_WEB_SERVICE_PORT` | 8080 in the game, 18090 in tests | Game, test harness |
| `CRPG_DISPLAY`, `XVFB_DISPLAY` | `:99` | Test harness |
| `USE_XVFB` | `1` | Test harness |
| `XVFB_BIN`, `FFMPEG_BIN` | auto-detect | Test harness |
| `CRPG_TURN_PACE`, `CRPG_SHOW_PAUSE` | `0.7`, `0.9` | Engine features in human mode |
| `REPORTS_DIR` | `tests/e2e/reports` | `environment.py` only. The runner and the report generator ignore it. |
| `ROBOS_CRPG_DIR` | `games/crpg-realm` | Campaign editor: the folder it reads and writes |

## Test suites

Counts are `Scenario` and `Scenario Outline` definitions in the feature files. An outline runs once per example row.

| Suite | Folder under `tests/e2e/features/` | Features | Scenarios |
|:---|:---|---:|---:|
| Engine | `engine/` | 13 | 125 |
| Normal (scene and UI) | `normal/` | 18 | 43 |
| Spells | `spells/` | 24 | 27 |
| Scenario adventures | `scenarios/` | 4 | 13 |
| Full playthroughs | `full_playthroughs/` | 6 | 7 |
