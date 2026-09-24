---
title: Infinity AI Agent & BDD Harness
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 6
description: How the Python test agent drives the Godot game over HTTP, what the BDD suites cover, and how runs are recorded to video under Xvfb.
---

# Infinity AI Agent & BDD Test Harness
{: .no_toc }

How the end-to-end tests play the game. A Python agent sends HTTP requests to a small server inside Godot; the server animates a visible cursor and then performs the action; behave runs the Gherkin features, records each scenario to MP4 and builds an HTML report. After reading this you will know what the agent actually decides, which endpoints it uses, and how to run and debug a feature.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

```
behave (tests/e2e/features/**/*.feature)
  └─ step definitions (steps/crpg_steps.py, steps/infinity_ai_steps.py)
       └─ InfinityAIAgent → VideoGameQAPlayer (qa_player/*.py)
            └─ HTTP  http://127.0.0.1:<port>/api/v1/...
                 └─ GameControlServer (autoload, scripts/GameControlServer.gd)
                      ├─ QAOverlay.human_move_and_click()  → animated cursor + click ping
                      └─ calls into GameState / HeroPlayer / the current scene script
```

[`tests/e2e/features/environment.py`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/tests/e2e/features/environment.py) wraps the whole run:

1. `before_all` starts `Xvfb :99 -screen 0 1920x1080x24`, then launches Godot **windowed** on that display with `--path <game> --port 18090`, and waits for `/api/v1/health`.
2. `before_scenario` puts the game in a known state (see [Scenario setup](#scenario-setup)), then starts `ffmpeg -f x11grab -framerate 30 ... -c:v libx264` writing `reports/videos/<scenario_key>.mp4`.
3. `after_scenario` saves `GET /api/v1/state` to `reports/gamestate_<scenario_key>.json` and stops ffmpeg.

Every scenario is recorded, whether it passes or fails.

---

## Suites

| Suite | Folder | Features | Scenarios | Flag |
|:---|:---|:---:|:---:|:---|
| Normal (isolated) | `tests/e2e/features/normal/` | 17 | 41 | `--normal` (default) |
| Spells | `tests/e2e/features/spells/` | 24 | 27 | `--spells` |
| Full playthroughs | `tests/e2e/features/full_playthroughs/` | 6 | 7 | `--playthrough` |
| **Total** | | **47** | **75** | `--all` |

Only two features drive the whole game through `InfinityAIAgent`: `full_playthroughs/05_infinity_ai_point_a_to_point_b_questing.feature` and `06_expanded_epic_campaign_playthrough.feature`. `normal/10_*` and `normal/11_*` use a few of its single-action steps (talk to NPC, pick up item, move to). Everything else, including playthroughs 01–04, uses the "the player ..." steps in `crpg_steps.py`, which call the same HTTP API one action at a time.

---

## What the agent really does

[`qa_player/infinity_ai_agent.py`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/qa_player/infinity_ai_agent.py) defines `InfinityAIAgent`, a subclass of `VideoGameQAPlayer` from [`qa_player/qa_player.py`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/qa_player/qa_player.py). It is a **scripted player**. It has no perception loop, no threat radar and no planner. Each method is a fixed sequence of HTTP calls with `time.sleep()` pauses, plus a few `if` checks on the JSON from `GET /state`.

| Method | What it sends |
|:---|:---|
| `create_character(race, hero_class, name, spells)` | types the name into `NameEdit`, `select_race`, clicks `Btn<Class>` (falls back to `select_class`), clicks `BtnReroll` twice, `select_spell` for each spell, clicks `EmbarkBtn`, waits for scene `Homestead`. |
| `quest_through_homestead()` | clicks `EloraNPC`, picks choice 0 up to 3 times, walks to fixed coordinates, clicks `Footlocker`, walks to `FrontDoor`, waits for `VillageSquare`. |
| `quest_through_village_square()` | walks to (820, 520), clicks `BlacksmithBrand`, picks choice 0, walks east, fights the hound (see below), walks to (1175, 360), clicks `GarrisonGate`. |
| `quest_through_garrison_keep()` | walks up the nave, clicks `MalakorBoss`, picks choice 0, then up to 9 rounds of `attack_malakor` until `flags.malakor_slain` or scene `VictoryScreen`. |
| `handle_encounters_as_they_come()` | one `POST /action {"action": "handle_encounters"}`. The game does the work (see below). |
| `talk_to_npc(id)`, `pickup_item(id)`, `enter_door(id)` | `/action` with `talk_npc`, `pickup_item`, `enter_door`; each resolves to `interact_target`, which walks the hero to 55 px from the node and interacts. |
| `move_to(target)` | `"x, y"` → `/user_input/move_to`; anything else → `/user_input/move_to_target`. |
| `execute_tactical_arena_clearing()` | `order_party_attack` for vance → wolf_alpha (×3), elora → skeleton_archer (×2), thrumbar → shadow_stalker (×2). |

### Class-specific choices

The only branching on class is in `quest_through_village_square()`, when the hero meets the Shadow Hound:

```python
if h_cls in ["wizard", "sorcerer"] and "magic-missile" in spells:
    self.cast_spell("magic-missile", target="ShadowHound")
elif h_cls == "cleric" and "cure-wounds" in spells:
    self.cast_spell("cure-wounds", target="hero")
    time.sleep(0.8)
    self.attack_target("ShadowHound")
elif h_cls == "rogue":
    self._post("/action", {"action": "ranged_attack", "args": {}})
else:
    self.attack_target("ShadowHound")
```

### Healing

There are two separate heal rules, and neither is a party-wide health monitor:

- **Agent, Malakor fight.** Before each round, if `hero.hp <= hero.max_hp // 2` it calls `use_inventory_item("potion-healing")`. The only spell heal is the cleric's `cure-wounds` on itself, cast once before hitting the hound.
- **Game, TacticalBattle.** `TacticalBattle.execute_combat_round()` gives a `potion-healing` to any party member at or below 50% HP (`GameState.execute_party_auto_heal`). The potion restores the member to full.

### What `handle_encounters` does

`_handle_encounter_clearing()` in `GameControlServer.gd` collects every direct child of the scene that has `take_damage`, a `hound_slain` signal or an `enemy_id`, and is not dead. For each one it animates the cursor, then calls the scene's `_engage_beast()`, `_engage_undead()` or `trigger_hound_combat()`. If the scene has none of those, it plays the hero's attack and calls `enemy.take_damage(99)`. It is a scripted clear, not tactical AI.

{: .note }
**Not implemented yet:** an agent that reads enemy positions and chooses targets, spacing or spells. Enemy behaviour lives in the game, not the agent: `TacticalEnemy` aggro radius 280 px, pack alerts within 480 px (`pack_friend_radius`) and 950 px (`pack_alert_radius`); the village `ShadowHound` switches to CHASE when the hero is closer than 190 px. See [Aggro, Tactics & Pack AI]({{ '/projects/crpg-realm/create-your-own-game/10-aggro-tactics-and-pack-ai.html' | relative_url }}).

---

## The in-game HTTP server

[`scripts/GameControlServer.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameControlServer.gd) is an autoload built on `TCPServer`. `_determine_port()` picks the port:

1. default `8080`;
2. `CRPG_WEB_SERVICE_PORT` environment variable, if set;
3. `--port=<n>` or `--port <n>` on the command line (user args after `--` also work).

If the port is busy it tries the next nine (`8080`–`8089` by default). The test harness always passes `18090`. Both clients (`VideoGameQAPlayer`, `InfinityAIAgent`) default to port `18090`.

Every route answers at both `/x` and `/api/v1/x`. Unknown routes return 404. `OPTIONS` returns a CORS response.

| Method | Path (`/api/v1` prefix optional) | Purpose |
|:---|:---|:---|
| GET | `/health` | `{"status": "ok", "game", "engine", "port"}` |
| GET | `/state` | Full state: `scene`, `hero`, `party`, `inventory`, `gold`, `quest_stage`, `flags`, `dialogue`, `battle`, `traps`, `status_effects`, `fog_of_war`, action-log text, and more |
| GET | `/screen_state` | Interactive nodes and their screen positions |
| GET | `/action_log` | Action log contents |
| GET | `/combat/round_stats` | Current scene's `get_combat_telemetry()` |
| GET | `/combat/turn_events` | Current scene's `get_all_turn_events()` |
| POST | `/user_input/click_button` | Click a `Button` by name or text |
| POST | `/user_input/type_text` | Type into a `LineEdit` |
| POST | `/user_input/click_object` | Click a world node by name or id |
| POST | `/user_input/mouse_click` | Push a real `InputEventMouseButton` at `x`,`y` (`shift` optional) |
| POST | `/user_input/move_to` | Move the party to `x`,`y` (`queue`, `teleport` optional) |
| POST | `/user_input/move_to_target` | Move to a node by id |
| POST | `/user_input/interact_target` | Walk to a node and interact |
| POST | `/user_input/click_dialog_choice` (alias `/dialog/choice`) | Pick a dialogue choice by `index` or `text` |
| POST | `/user_input/select_option` | Choose an `OptionButton` item |
| POST | `/user_input/inventory/toggle` | Open/close inventory |
| POST | `/user_input/inventory/use_item` | Use an item |
| POST | `/user_input/inventory/equip_item` | Equip an item |
| POST | `/user_input/action_log/set_size` | `small`, `medium`, `large` or `cycle` |
| POST | `/user_input/pan_camera`, `/user_input/center_camera` | Camera control |
| POST | `/qa/set_step` | Show the current Gherkin step in the overlay |
| POST | `/qa/scenario_splash` | Show the scenario title card |
| POST | `/qa/give_item` | Put an item in the inventory (test setup) |
| POST | `/setup_state` | Load a scene with a given hero, party, inventory, gold, quest stage and flags |
| POST | `/reset` | Return to `CharacterSelect` with fresh state |
| POST | `/action` | `{"action": "<name>", "args": {...}}` dispatcher (below) |

`/action` names are the `match` branches of `_execute_game_action()`. Grouped:

| Group | Actions |
|:---|:---|
| Movement & interaction | `move_to_target`, `move_to`/`move`, `move_hero`, `interact_target`/`click_object`, `talk_npc`, `pickup_item`, `enter_door`, `approach_enemy` |
| Dialogue & UI | `select_dialogue_choice` (+ aliases), `close_dialogue`, `scroll_action_log`, `open_character_status`, `close_character_status`, `toggle_pause`, `set_paused`, `set_fog_of_war`, `toggle_fog` |
| Character creation & story | `select_race`, `select_class`, `select_spell`, `reroll_stats`, `embark`, `talk_partner`, `loot_footlocker`, `exit_to_village`, `talk_blacksmith`, `enter_garrison`, `confront_malakor`, `attack_malakor`, `defeat_malakor` |
| Combat | `attack_hound`, `ranged_attack`, `attack_target`/`attack_enemy`/`attack`, `cast_spell`, `cast_fireball`, `use_fighter_ability`, `order_party_attack`, `taunt_enemy`, `handle_encounters`/`clear_threats`, `execute_combat_round`, `get_round_stats`, `enemy_strike`, `inflict_party_damage`, `set_party_member_hp`, `trigger_auto_heal`, `retry_encounter` |
| Items & shop | `equip_item`, `open_shop`, `close_shop`, `switch_shop_tab`, `buy_item`, `sell_item`, `loot_enemy_corpse`/`loot_corpse` |
| Party | `select_party_member`, `select_all_party`, `set_party_leader`, `get_party_leader`, `set_party_formation`, `get_party_formation`, `move_party_formation`, `action_toolbar_click` |
| Status & traps | `apply_status_effect`, `remove_status_effect`, `set_status_duration`, `dispel_magic`, `find_traps`, `disarm_trap`, `trigger_trap` |
| Test fixtures | `start_tactical_battle`, `setup_goblin_crowd`, `setup_spell_encounter`, `start_golem_battle`, `simulate_golem_assault`, `set_enemy_hostility`, `set_enemy_position` |

{: .important }
The API is not pure input simulation. `mouse_click` pushes a real input event, but most handlers animate the cursor and then call game code directly (for example `move_to` calls `GameState.move_party_formation()`), and `/setup_state`, `/qa/give_item` and the fixture actions change state outright. The full reference is on the [Reference page]({{ '/projects/crpg-realm/reference.html' | relative_url }}).

---

## The visible cursor (`QAOverlay.gd`)

`xvfb`'s own pointer is not recorded (`-draw_mouse 0`). What you see in the videos is the `QAOverlay` autoload's virtual cursor. [`QAOverlay.human_move_and_click()`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/QAOverlay.gd) moves it along a **quadratic Bézier** curve whose control point sits off the straight line, tweened with cubic ease-out:

```gdscript
var duration = clamp(dist / 2400.0 + 0.12, 0.16, 0.34)
var mid = (start_pos + target_pos) * 0.5
var dir = (target_pos - start_pos).normalized()
var perp = Vector2(-dir.y, dir.x)
var arc_sign = 1.0 if int(start_pos.x + target_pos.y) % 2 == 0 else -1.0
var arc_offset = perp * (clamp(dist * 0.08, 10.0, 32.0) * arc_sign)
var ctrl_pt = mid + arc_offset

var tw = create_tween()
tw.set_trans(Tween.TRANS_CUBIC)
tw.set_ease(Tween.EASE_OUT)

tw.tween_method(func(t: float):
	var inv_t = 1.0 - t
	var p = inv_t * inv_t * start_pos + 2.0 * inv_t * t * ctrl_pt + t * t * target_pos
	# ...
, 0.0, 1.0, duration)
```

After the move it plays a click animation and spawns a ping (`spawn_click_ping`). `set_step()` shows the current Gherkin step at the top of the screen; `show_scenario_splash()` shows the title card at scenario start.

![Threat and aggro scenario splash]({{ '/assets/images/crpg-realm/threat_aggro_splash.png' | relative_url }}){: .robos-zoomable-img }
*Scenario splash from `normal/06_infinity_aggro_threat_and_target_switching.feature`.*

---

## Scenario setup

`before_scenario` decides how to start each scenario:

- **Full playthroughs** (feature under `full_playthroughs/`, or tags `full_journey`, `full_playthrough`, `journey`, `playthrough`) and character-creation scenarios: `POST /reset` to return to `CharacterSelect`.
- **Everything else:** `POST /setup_state` with a hero named "Lieutenant Vance" (fighter), 150 gold, and a scene chosen from a `@scene:<Name>` tag, the feature file name, or words in the step text. `TacticalBattle` gets companions `elora` and `thrumbar`; `VillageSquare` gets `elora`, quest stage 2 and flags `partner_conversed`, `footlocker_looted`.

---

## A real feature

This is [`full_playthroughs/06_expanded_epic_campaign_playthrough.feature`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/tests/e2e/features/full_playthroughs/06_expanded_epic_campaign_playthrough.feature), verbatim:

```gherkin
@full_playthrough @epic_campaign
Feature: Expanded Epic Campaign Full Playthrough
  As an Infinity Engine player
  I want the Infinity AI Agent to autonomously quest through the entire expanded realm
  From character creation through Homestead, Village Square, Whispering Forest, and Keep to achieve Victory

  Background:
    Given the cRPG game is running and healthy

  Scenario: Autonomous Infinity AI Agent Embarks and Vanquishes Malakor in Epic Campaign
    When the infinity ai agent creates a character with race "human" and class "fighter" named "Sir Donald"
    And the current scene is "Homestead"
    And the infinity ai agent quests through Homestead from awakening to the village portal
    And the current scene is "VillageSquare"
    And the infinity ai engine handles the enemy encounters as they come
    And the infinity ai agent talks to NPC "npc-id-1"
    And the infinity ai agent picks up item "item-id-1"
    And the infinity ai agent moves to the door "door-id-1"
    And the infinity ai agent enters door "door-id-1"
    And the current scene is "GarrisonKeep"
    And the infinity ai agent infiltrates the Garrison Keep and defeats Captain Malakor
    Then the victory screen is visible
```

Despite the feature description, the steps never visit the Whispering Forest; they go straight from the village to the Keep. `npc-id-1` is Blacksmith Brand. Clicking him runs `VillageSquare.talk_to_blacksmith()`, which adds `garrison-key` to the inventory as soon as the dialogue starts; that key unlocks `door-id-1` (the Royal Garrison Gate).

![Keep victory]({{ '/assets/images/crpg-realm/keep_victory.png' | relative_url }}){: .robos-zoomable-img }
*The end of the playthrough: Malakor defeated in the Garrison Keep.*

---

## Run it

Install the Python dependencies once: `pip install behave behave-html-formatter`. You also need Godot 4.3, `Xvfb` and `ffmpeg`. From `games/crpg-realm`:

```bash
python3 run_cucumber_tests.py                  # normal suite
python3 run_cucumber_tests.py --spells
python3 run_cucumber_tests.py --playthrough
python3 run_cucumber_tests.py --all
python3 run_cucumber_tests.py tests/e2e/features/full_playthroughs/06_expanded_epic_campaign_playthrough.feature
```

Suite flags have aliases: `--isolated`, `--playthroughs`/`--full`, `--spell`/`--magic`, `--both`. Any other argument is passed through to `behave` (for example `-n "<scenario name>"`).

| Variable | Default | Used by |
|:---|:---|:---|
| `GODOT_BIN` | first found of `~/apps/godot4`, `~/.local/bin/godot4`, `/usr/bin/godot4`, ... then `godot4`/`godot` on `PATH` | `environment.py` |
| `XVFB_BIN` | `Xvfb` on `PATH` | `environment.py` |
| `FFMPEG_BIN` | `ffmpeg` on `PATH`, else `/usr/bin/ffmpeg` | `environment.py` |
| `USE_XVFB` | `1` (`0`/`false`/`no` to use your own display) | `environment.py` |
| `CRPG_DISPLAY` / `XVFB_DISPLAY` | `:99` | `environment.py` |
| `CRPG_WEB_SERVICE_PORT` | `18090` in tests; `8080` in the game | `environment.py`, `GameControlServer.gd` |
| `REPORTS_DIR` | `tests/e2e/reports` | `environment.py` only |

Outputs in `tests/e2e/reports/`: `index.html`, `videos/<scenario_key>.mp4`, `gamestate_<scenario_key>.json`, `godot_output.log`, `ffmpeg.log`. `<scenario_key>` is the scenario name lower-cased, spaces and hyphens turned into `_`, other punctuation removed.

behave first writes `index.html` with `behave_html_formatter`. Then `run_cucumber_tests.py` runs [`tests/e2e/generate_report.py`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/tests/e2e/generate_report.py), which **replaces** `index.html` with its own page. That page lists every `Scenario:` in every feature file and embeds the matching video and state JSON if they exist on disk. (`run_cucumber_tests.py` also contains an `embed_artifacts()` function for the behave report, but `main()` never calls it.)

---

## Gotchas

- **The HTML report does not show pass/fail.** `generate_report.py` marks a scenario "passed" when its MP4 exists, and every scenario gets a video. Read the behave console output or exit code for real results. Old videos from earlier runs also show up in the report.
- **`REPORTS_DIR` only half works.** `environment.py` honours it, but `run_cucumber_tests.py` and `generate_report.py` always use `tests/e2e/reports/`. Setting it splits videos from the report.
- **Scene routing uses file names.** For isolated features, `before_scenario` picks the start scene partly from name fragments like `05_multi_party` or `10_`. Renaming or renumbering a feature can change its start scene. Add a `@scene:VillageSquare` tag to be explicit.
- **Scripted fights always win.** `handle_encounters` falls back to `take_damage(99)`, and `VillageSquare._execute_hero_strike_on_hound()` also deals 99 damage. These steps check the flow, not combat balance.
- **Coordinates are hard-coded.** The quest methods walk to fixed pixel positions. Move a door or NPC in a `.tscn` and update `infinity_ai_agent.py` too.
- **One Godot per run.** `before_all` launches Godot once; scenarios share it and rely on `/reset` or `/setup_state` to clean up. A scenario that leaves a modal open can break the next one.
- **Port clashes.** If 18090 is taken, the game silently binds 18091–18099 and the tests fail the health check. Free the port or set `CRPG_WEB_SERVICE_PORT`.

[← Previous: Game Creation Process]({{ '/projects/crpg-realm/game-creation-process.html' | relative_url }}) · [Next: World Systems & Pathfinding →]({{ '/projects/crpg-realm/world-systems-and-pathfinding.html' | relative_url }})
