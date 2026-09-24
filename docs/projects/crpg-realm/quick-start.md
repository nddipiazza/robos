---
title: Quick Start
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 1
description: "Install Godot, run Realm of Heroes, and run the BDD test suites with video recording in about ten minutes."
---

# Quick Start
{: .no_toc }

Get the game running, play the first scene, then run the automated test suites. Everything lives in `games/crpg-realm/` in the [RobOS repository](https://github.com/nddipiazza/robos/tree/main/games/crpg-realm).
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Prerequisites

| Need | For | Notes |
|:---|:---|:---|
| **Godot 4.3** (standard build, not .NET) | Playing and testing | The project declares the `4.3` feature and the GL Compatibility renderer, so it runs on modest GPUs. |
| **Python 3** + `behave`, `behave-html-formatter` | Tests only | No `requirements.txt` exists; install them yourself (below). |
| **Xvfb** | Tests only | Godot runs *windowed* inside a virtual X display. Linux only. |
| **ffmpeg** | Tests only | Records every scenario to MP4. |

```bash
git clone https://github.com/nddipiazza/robos.git
cd robos/games/crpg-realm

# test-only dependencies (Debian/Ubuntu)
sudo apt install xvfb ffmpeg
python3 -m pip install behave behave-html-formatter
```

## 2. Play the game

```bash
./play.sh
```

`play.sh` finds Godot in this order and then runs `godot --path .`:

1. `$GODOT_BIN` (if it is executable)
2. `~/apps/godot4`
3. `godot4` on your `PATH`
4. `godot` on your `PATH`

If none is found it exits with *"Godot 4 binary not found"*. Fix it with `export GODOT_BIN=/path/to/Godot_v4.3-stable_linux.x86_64`.

The game opens on **Character Select** (`scenes/CharacterSelect.tscn`). Pick one of 9 races and 12 classes, then start. You wake up in the **Homestead** (Act 1). See [Controls]({{ '/projects/crpg-realm/controls.html' | relative_url }}) for keys; the essentials are:

- **Left-click** the ground to move, **Shift-click** to queue waypoints.
- **Left-click** NPCs, doors, chests, items and enemies to interact.
- **Space** pauses and resumes (real-time with pause).
- **1–9** picks a dialogue reply in the log.

You can also open the project in the Godot editor (`godot --editor --path .`) and press F5.

### Jump straight to a scene

`debug.sh` takes the same Godot lookup and starts a chosen scene instead of Character Select:

```bash
./debug.sh --scene VillageSquare        # short names: Homestead, VillageSquare, GarrisonKeep, VictoryScreen, TestRunner
./debug.sh --scene res://scenes/AncientCatacombs.tscn   # any other scene: pass the res:// path
```

{: .note }
Starting mid-campaign skips the setup that Character Select and earlier scenes perform, so party members, items and quest flags will be at their defaults.

## 3. The campaign at a glance

| Act | Scene | What happens |
|:---|:---|:---|
| 1 | `Homestead.tscn` | Wake up, loot the footlocker, meet Elora. Leaving is scripted and takes you to the village. |
| 2 | `VillageSquare.tscn` | 12 townsfolk, shops, ground items. The Royal Garrison Gate is locked. |
| 3 | `WhisperingForest.tscn` | River and bridge, dire wolves, the goblin peddler and the hermit. |
| 4 | `AncientCatacombs.tscn` | Traps, skeleton archers, the Spirit of Sir Justin, and the sarcophagus. |
| 5 | `GarrisonKeep.tscn` | Confront Captain Malakor. Winning loads `VictoryScreen.tscn`. |

The exact door-to-door graph is in [Scenes & Door Portals]({{ '/projects/crpg-realm/create-your-own-game/02-scenes-and-portals.html' | relative_url }}).

## 4. Run the tests

```bash
python3 run_cucumber_tests.py              # normal suite (default): 17 features
python3 run_cucumber_tests.py --spells     # 24 spell features
python3 run_cucumber_tests.py --playthrough  # 6 start-to-finish playthroughs
python3 run_cucumber_tests.py --all        # everything (47 features)

# one feature file
python3 run_cucumber_tests.py tests/e2e/features/normal/12_infinity_engine_traps_detection_and_disarm.feature
```

Any other argument is passed through to `behave` (for example `-n "scenario name"` or `--tags`).

What happens:

1. Once per run, Xvfb starts on `:99` at 1920×1080×24 and Godot starts windowed on that display, with the in-game HTTP control server on port **18090**.
2. Before each scenario the game is reset (and, for most scenarios, moved to a starting scene), and ffmpeg starts recording the display at 30 fps.
3. Steps drive the game through HTTP (`/api/v1/action`, `/api/v1/setup_state`, …) and assert on `/api/v1/state`.
4. After each scenario the video and a GameState JSON snapshot are saved.

Results:

- Behave's console summary and exit code are the source of truth.
- HTML report: `tests/e2e/reports/index.html`
- Videos: `tests/e2e/reports/videos/<scenario_name>.mp4`

{: .warning }
The generated HTML report marks a scenario as passed whenever its video exists. Every scenario is recorded, so that badge does not reflect failures. Check the console output or the exit code.

### Useful environment variables

| Variable | Default | Effect |
|:---|:---|:---|
| `GODOT_BIN` | auto-detected | Godot binary used by the tests. |
| `XVFB_BIN`, `FFMPEG_BIN` | auto-detected | Override tool paths. |
| `USE_XVFB` | `1` | Set to `0` to run on your real display and watch. |
| `CRPG_DISPLAY` / `XVFB_DISPLAY` | `:99` | Virtual display number. |
| `CRPG_WEB_SERVICE_PORT` | `18090` | HTTP control server port. |

Full details: [Cucumber BDD & Video Proof]({{ '/projects/crpg-realm/create-your-own-game/08-cucumber-bdd-testing.html' | relative_url }}).

## 5. Poke the running game over HTTP

Every run of the game, including `./play.sh`, starts `GameControlServer` on `127.0.0.1`. Outside the tests it defaults to port **8080** and tries up to 8089 if that is taken. The console prints the chosen port.

```bash
curl -s http://127.0.0.1:8080/api/v1/health
curl -s http://127.0.0.1:8080/api/v1/state | python3 -m json.tool | head -40
```

Choose the port with `CRPG_WEB_SERVICE_PORT=18090 ./play.sh` or `./play.sh -- --port 18090`. The endpoint list is in the [Reference]({{ '/projects/crpg-realm/reference.html' | relative_url }}).

{: .important }
The control server has no authentication. It only binds to localhost, but anything on your machine can drive the game while it runs.

## Troubleshooting

| Symptom | Fix |
|:---|:---|
| `Godot 4 binary not found` | Set `GODOT_BIN` to the full path of a Godot 4.3 binary. |
| Godot opens a *Project Manager* or complains about the version | Use Godot 4.3. Newer 4.x releases usually work but may offer to upgrade `project.godot`; don't commit that change. |
| `Web service did not respond on port 18090 in time!` | Godot failed to start or another process holds the port. Check the `[GameControlServer]` lines in the output, or try `CRPG_WEB_SERVICE_PORT=18190`. |
| `No module named behave` | `python3 -m pip install behave behave-html-formatter` with the same `python3` you run the tests with. |
| Blank or black videos | Xvfb or ffmpeg is missing, or `USE_XVFB=0` is recording a different display. |

## Where next

- **Playing:** [Controls]({{ '/projects/crpg-realm/controls.html' | relative_url }})
- **Building your own content:** [Creating Your Own Game]({{ '/projects/crpg-realm/create-your-own-game.html' | relative_url }})
- **Looking something up:** [Reference]({{ '/projects/crpg-realm/reference.html' | relative_url }})
