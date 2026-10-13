---
title: "Tabletop RPG"
layout: default
parent: Projects
permalink: /projects/tabletop-rpg/
nav_order: 3
description: "A HeroQuest-style dungeon crawler in Godot 4 with data-driven cartridges, an HTTP control API and automated end-to-end tests."
---

# Tabletop RPG (HeroQuest engine)
{: .no_toc }

A turn-based dungeon crawler in Godot 4.3, modelled on the HeroQuest board game, in `games/tabletop-rpg`. This page covers how to run it, what it contains, and how its parts fit together.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

![A dungeon board with rooms, doors and torches]({{ '/assets/images/tabletop-rpg/fan_dungeon_28x21.jpg' | relative_url }}){: .robos-zoomable-img }

*The Fan Dungeon board image, the 28x21 map used by Quest 1. Rooms are the walled areas; the open space between them is corridor.*

## Run it

You need Godot 4.3, the version `project.godot` targets (GL Compatibility renderer). The game does not bundle it. `play.sh` looks for the binary in `$GODOT_BIN`, then `~/.local/bin/godot`, `~/apps/godot4`, and `godot4` or `godot` on your `PATH`. It exits with an error if none exists.

```bash
./games/tabletop-rpg/play.sh                   # prompts for a quest; defaults to quest 4 after 4 seconds
./games/tabletop-rpg/play.sh --quest 1         # quest 1, from the heroquest-the-trial cartridge
./games/tabletop-rpg/play.sh --cartridge heroquest-fortress-fire-king
./games/tabletop-rpg/play.sh --dm              # play the Game Master (Zargon) instead of the heroes
./games/tabletop-rpg/play.sh --auto-play       # scripted demo turn sequence
./games/tabletop-rpg/play.sh --headless --auto-play --quit-after 160
```

Other flags in `play.sh`: `--reset` starts a new game instead of resuming, `--player` selects the hero side, and `--hard` sets hard mode. Without a terminal and without a cartridge argument, it loads `heroquest-the-trial`.

## What is in the game

The game loads a cartridge, a single `.cartridge.json` file that holds heroes, monsters, quests and maps. Two ship in `games/tabletop-rpg/cartridges`.

| Cartridge | Quests | Maps |
|:---|:---|:---|
| `heroquest-the-trial` | Quest 1: The Trial. Quest 2: The Rescue of Sir Ragnar. Quest 3: Lair of the Orc Warlord. | Quest 1 uses the 28x21 Fan Dungeon, quest 2 the 26x19 classic board, quest 3 the 26x19 First Light caverns. |
| `heroquest-fortress-fire-king` | Quest 4: The Fortress of the Fire King. | One 26x19 map. Its heroes carry their own gear and spells, and the file defines 28 monsters. |

The rules in code:

- **Movement.** A hero rolls 2d6 for movement (`TabletopDice.gd`).
- **Combat.** Each combat die has three skulls, two white shields and one black shield. Wounds are the attacker's skulls minus the defender's shields, to a minimum of zero. A defending hero counts white shields and a defending monster counts black shields.
- **Fog of war.** Rooms stay hidden until a hero opens a door into them.
- **Spells.** `HeroQuestSpells.gd` defines 12 spells in four decks (fire, earth, water, air), plus 10 dread spells for the Game Master.

The four heroes in the Quest 1 cartridge:

| Hero | Body | Mind | Attack dice | Defend dice |
|:---|:---:|:---:|:---:|:---:|
| Barbarian | 8 | 2 | 3 | 2 |
| Dwarf | 7 | 3 | 2 | 2 |
| Elf | 6 | 4 | 2 | 2 |
| Wizard | 4 | 6 | 1 | 2 |

## How the parts fit

| Part | Location | Role |
|:---|:---|:---|
| Game | `games/tabletop-rpg` | Godot project. Main scene `TabletopWorld.tscn`; autoloads for dice, cartridges, spells, equipment and the control server. |
| Shared library | `packages/robos-gaming` | Node.js code for dice, a board grid with walls and doors, three map configurations, a cartridge bundler that validates a cartridge, and the gaming ontology with its SHACL shapes. |
| Knowledge graph | `.robos/kgraphs/tabletop-game` | The `robos.tabletop` package: heroes, monsters, spell cards, furniture, map configurations and test scenarios. Hero nodes refer to starting weapons defined in the `robos.game` package in `.robos/kgraphs/game`. |
| Cartridge editor | [RobOS Tabletop Studio]({{ '/apps/robos-tabletop/' | relative_url }}) | Electron app for editing cartridge data. |
| Map tool | [Tabletop Blockmap Creator]({{ '/apps/tabletop-blockmap-creator/' | relative_url }}) | Electron app for calibrating a grid over a dungeon image and drawing corridors and rooms. |

## Control API

While the game runs, `GameControlServer.gd` listens on `127.0.0.1:18092`. Set `TABLETOP_SERVER_PORT` to use another port.

| Request | Purpose |
|:---|:---|
| `GET /api/v1/health` | Liveness check. |
| `GET /api/v1/state` | Current game state as JSON. |
| `GET /api/v1/cartridges` | Discovered cartridges and the active one. |
| `POST /api/v1/action` | Run a game action, such as rolling movement, moving, opening a door or attacking. |
| `POST /api/v1/cartridge/insert` | Load a different cartridge. |
| `POST /api/v1/screenshot` | Save a PNG to the path in the request body. |

`rpc_ai/tabletop_qa_player.py` is a Python client for this API. `rpc_ai/tabletop_rpc_ai.py` builds on it to play whole turns.

## Tests

The library tests need only Node.js:

```bash
npm --prefix packages/robos-gaming test
```

The game has 60 `test_*.py` files in `games/tabletop-rpg/tests`. 58 of them launch the game through `play.sh`, typically with `--headless` and a dedicated port. They then drive the game through the control API with `TabletopQAPlayer` and assert on the returned state. They need a Godot binary. Run one directly:

```bash
python3 games/tabletop-rpg/tests/test_tabletop_cartridge.py
```

`tests/record_tabletop_gameplay.py` plays a scripted session in a virtual display (Xvfb at 1920x1080), records it with FFmpeg and writes an MP4 and a WebVTT caption file to `~/.robos/development/walkthroughs/tabletop-gameplay/`.
