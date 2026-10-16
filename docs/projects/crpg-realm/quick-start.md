---
title: CRPG quick start
layout: default
parent: Realm of Heroes CRPG
grand_parent: Projects
nav_order: 1
description: Install Godot 4.3, run Realm of Heroes from source, start a cartridge or a single scene, and run the BDD test suites.
---

# CRPG quick start
{: .no_toc }

How to run Realm of Heroes from the RobOS repository, start a specific campaign or scene, and run its automated tests. The game lives in `games/crpg-realm/`.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Prerequisites

| Need | For | Notes |
|:---|:---|:---|
| Git, Godot 4.3 | Playing, tests | `project.godot` declares the `4.3` feature and the GL Compatibility renderer. |
| Python 3, `behave`, `behave-html-formatter` | Tests | The repo has no `requirements.txt`. The test code itself uses only the standard library plus `behave`. |
| `Xvfb`, `ffmpeg` | Tests that record video | Linux only. Not needed in backend mode (see [Run the tests](#run-the-tests)). |
| Node.js and npm | [Campaign editor]({{ '/projects/crpg-realm/campaign-editor-tutorial.html' | relative_url }}) | The editor is an Electron app. |

```bash
git clone https://github.com/nddipiazza/robos.git
cd robos/games/crpg-realm
python3 -m pip install behave behave-html-formatter   # tests only
```

## Play the game

```bash
./play.sh
```

`play.sh` looks for Godot in this order, then runs `godot --path . <your arguments>`:

1. the file named by `$GODOT_BIN`
2. `~/apps/godot4`
3. `godot4` on your `PATH`
4. `godot` on your `PATH`

If none is found it prints `Error: Godot 4 binary not found` and exits. Set `GODOT_BIN` to fix that:

```bash
GODOT_BIN=/path/to/Godot_v4.3-stable_linux.x86_64 ./play.sh
```

You can also open the folder in the Godot editor (`godot --editor --path .`) and press F5.

The game opens on Character Select. There you set the hero name (blank becomes "Lieutenant Vance"), pick one of 9 races and 12 classes, optionally toggle the spells Magic Missile, Cure Wounds and Fireball, and press **RE-ROLL STATS** until the ability scores (4d6, drop the lowest die) suit you. The **EMBARK INTO OAKHAVEN** button starts the game.

### Cartridges

If `res://cartridges/` (or `user://cartridges/`) contains cartridge files, Character Select also shows a cartridge bar at the top left: a drop-down plus **Play** and **Auto-Play** buttons. The repository ships six, and `rescue-the-princess` is selected by default. While a cartridge is selected, Embark loads that cartridge's starting map instead of the Homestead scene. **Auto-Play** lets the game play the cartridge's story by itself.

| Cartridge id | Title |
|:---|:---|
| `candlekeep-prologue` | Candlekeep: The Prophecy Begins |
| `crypt-of-the-archmage` | Crypt of the Archmage |
| `dragonwarrior-1-usa` | Dragon Warrior (USA) |
| `rescue-the-princess` | Rescue of Princess Jennifer |
| `sword-sanctuary` | Sanctuary of the Blade |
| `underdark-incursion` | Descent into the Cavern Depths |

To skip Character Select and start a cartridge directly, pass it on the command line. Arguments after the script name go to Godot, and the game reads them itself:

```bash
./play.sh --cartridge rescue-the-princess
./play.sh --cartridge rescue-the-princess --auto-play
./play.sh --cartridge rescue-the-princess --map main-castle
```

`--campaign` is an alias for `--cartridge`, and `--starting-map` for `--map`. The environment variables `CRPG_CARTRIDGE`, `CRPG_CAMPAIGN`, `CRPG_MAP` and `CRPG_AUTO_PLAY=1` do the same. You can also pass a path that starts with `res://` or `user://`, or that ends in `.json`.

If you pass the slug of a campaign that has no cartridge, the game builds one on the fly from `campaigns/<slug>.jsonld`, but with empty map, character and item tables. Create real cartridges with the [editor or the bundler]({{ '/projects/crpg-realm/campaign-editor-tutorial.html#build-a-cartridge' | relative_url }}).

### The original five-scene campaign

The hand-built scenes (`Homestead`, `VillageSquare`, `WhisperingForest`, `AncientCatacombs`, `GarrisonKeep`) are still in the repository. Start one directly with `debug.sh`:

```bash
./debug.sh --scene Homestead
./debug.sh --scene res://scenes/AncientCatacombs.tscn
```

The short names `Homestead`, `VillageSquare`, `GarrisonKeep`, `VictoryScreen` and `TestRunner` are built in. For any other scene, pass the `res://` path. `debug.sh` skips Character Select, so party members, items and quest flags are at their defaults. The [hub page]({{ '/projects/crpg-realm/' | relative_url }}#the-original-campaign) shows how the scenes connect.

### Demo mode

The demo mode plays the test suite inside the game, with the scenario splash cards, step bar and proof panel on screen. Use the **Demo Arena** and **Real cRPG Demo** buttons on Character Select, or:

```bash
./play.sh --demo        # engine scenarios in the Scenario Arena
./play.sh --real-demo   # campaign playthroughs in the real scenes
```

Demo keys are on the [controls page]({{ '/projects/crpg-realm/controls.html#demo-mode' | relative_url }}).

### Browser build

```bash
./export_web.sh
```

This exports `build/web/` and `build/realm-of-heroes-web.zip`. It needs the Godot 4.3 web export templates in `~/.local/share/godot/export_templates/4.3.stable/`. In a browser build the control server does not start and the test panels are hidden.

## Run the tests

Run all commands from `games/crpg-realm/`. There are two test layers that matter day to day. The details are on the [testing page]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }}).

```bash
# Engine suite: rules, spells, AI, maps. Headless Godot, no video.
python3 run_cucumber_tests.py --engine --backend

# Same suite with video, splash cards and pauses ("prove it to a human")
python3 run_cucumber_tests.py --engine --human

# Scene and UI features under Xvfb, one MP4 per scenario
python3 run_cucumber_tests.py            # tests/e2e/features/normal
python3 run_cucumber_tests.py --spells
python3 run_cucumber_tests.py --playthrough
python3 run_cucumber_tests.py --scenarios

# Everything under tests/e2e/features/
python3 run_cucumber_tests.py --all

# One feature file
python3 run_cucumber_tests.py tests/e2e/features/normal/12_infinity_engine_traps_detection_and_disarm.feature
```

Arguments the runner does not recognize go to `behave`, for example `-n "scenario name"` or `--tags=@find_traps`.

In human mode the harness starts Xvfb on display `:99` at 1920x1080 once per run, and starts one Godot process on it with the control server on port 18090. Before each scenario the harness resets the game and starts `ffmpeg` recording at 30 fps. In backend mode it starts Godot with `--headless` and records nothing.

Where results go:

- The console summary and the exit code from `behave` are the real result.
- Videos: `tests/e2e/reports/videos/<scenario_name>.mp4` (human mode only).
- Game state snapshots, `godot_output.log` and `ffmpeg.log` are in `tests/e2e/reports/`.
- `tests/e2e/reports/index.html` is a report page.

{: .warning }
The HTML report marks a scenario PASSED when its video file exists, not when it passed. A failed scenario that was recorded still shows PASSED, and in backend mode, which records no video, every scenario shows FAILED. Read the console output or the exit code.

Environment variables the test harness reads:

| Variable | Default | Effect |
|:---|:---|:---|
| `CRPG_MODE` | `human` | `backend` runs headless with no video, overlays or pauses. |
| `CRPG_WEB_SERVICE_PORT` | `18090` | Port for the game's control server. |
| `CRPG_DISPLAY` or `XVFB_DISPLAY` | `:99` | X display Godot renders on. |
| `USE_XVFB` | `1` | `0`, `false` or `no` does not start Xvfb. Also set `CRPG_DISPLAY` to your own display. |
| `GODOT_BIN`, `XVFB_BIN`, `FFMPEG_BIN` | auto-detected | Tool paths. |
| `CRPG_TURN_PACE`, `CRPG_SHOW_PAUSE` | `0.7`, `0.9` | Seconds between AI turns and after each action in human mode (engine features). |

## Talk to the running game

Every desktop run starts `GameControlServer` on `127.0.0.1`. Outside the tests it listens on port 8080 and tries up to 8089 if that is busy. The port is printed in the Godot output.

```bash
curl -s http://127.0.0.1:8080/api/v1/health
curl -s http://127.0.0.1:8080/api/v1/state | python3 -m json.tool | head -40
```

Choose the port with `CRPG_WEB_SERVICE_PORT=18090 ./play.sh` or `./play.sh --port 18090`. The endpoint list is on the [reference page]({{ '/projects/crpg-realm/reference.html#http-control-api' | relative_url }}).

{: .important }
The control server has no authentication. It binds to localhost only, but any local process can drive the game while it runs.

## Troubleshooting

| Symptom | Cause and fix |
|:---|:---|
| `Godot 4 binary not found` | Set `GODOT_BIN` to a Godot 4.3 binary. |
| `Web service did not respond on port 18090 in time!` during tests | Godot did not start, or another process holds the port. Read `tests/e2e/reports/godot_output.log`, or set `CRPG_WEB_SERVICE_PORT` to another port. If 18090 is taken but a nearby port is free, the game binds the nearby port and the tests still call 18090. |
| `No module named behave` | Install `behave` with the same `python3` that runs the tests. |
| Videos are black or missing | Xvfb or ffmpeg is missing, or `USE_XVFB=0` points at a different display than `CRPG_DISPLAY`. |
