---
title: "RobOS RTS"
layout: default
parent: Projects
permalink: /projects/robos-rts/
nav_order: 4
description: "Starfall Command: a three-faction real-time strategy game in Godot 4 with an angled 3D camera, a deterministic 64 Hz simulation and an HTTP bot API."
---

# RobOS RTS: Starfall Command
{: .no_toc }

A real-time strategy game in Godot 4.3, in `games/robos-rts`. Three asymmetric factions fight over crystal and aether on a canyon map. The simulation is deterministic and runs at a fixed 64 ticks per second, separately from rendering, so the same game can be played by a person, driven by a script, or run headless in tests.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

![Starfall Canyon at the start of a match: the Meridian Guard base on the western plateau]({{ '/assets/images/robos-rts/01-starfall-canyon-start.jpg' | relative_url }}){: .robos-zoomable-img }

*The start of a match on Starfall Canyon. The player's base is on the western plateau; the ramp in the middle is the only way down to the low ground.*

The game takes its conventions from the RTS genre in general: base building, a worker economy, control groups, a minimap and a command card. Open-source RTS projects such as OpenRA, 0 A.D., Warzone 2100 and Beyond All Reason are good references for the genre. Every name, model and rule here is original to this repository.

## Run it

You need Godot 4.3 (`GODOT_BIN`, `godot4` or `godot` on your `PATH`).

```bash
games/robos-rts/play.sh
```

Without a display, the headless Cucumber suite needs Python with `behave`:

```bash
cd games/robos-rts
./run_cucumber_tests.py --backend
```

The window opens on the Meridian Guard base. Press **F1** in the game for the controls overlay.

## The screen

The layout follows RTS convention: resources top-right, minimap bottom-left, the selection in the middle and the command card bottom-right. Everything on screen reads live simulation state. Health bars appear only on selected, damaged or under-construction units.

![A Rifleman selected: portrait, health, damage, range and the command card]({{ '/assets/images/robos-rts/05-unit-panel-rifleman.jpg' | relative_url }}){: .robos-zoomable-img }

*One unit selected. The portrait is rendered from the unit's own 3D model. The panel lists health, damage with damage per second, range, armor and speed, plus the weapon's name and any bonus damage. The command card shows what the unit can do.*

### Selecting units

Drag a box to select a squad. In a mixed selection the gold-bordered type is the active subgroup, which owns the command card; press **Tab** to cycle it. Double click selects every unit of that type on screen. Ctrl+1 to 9 sets a control group and the number recalls it; double press to center the camera.

![Eight units box-selected: six Riflemen, a Breacher and a Howitzer]({{ '/assets/images/robos-rts/06-squad-selection.jpg' | relative_url }}){: .robos-zoomable-img }

![Control group tabs above the selection panel and the idle worker button at the left]({{ '/assets/images/robos-rts/12-control-groups-idle-workers.jpg' | relative_url }}){: .robos-zoomable-img }

*Control group tabs sit above the selection panel. The idle worker button at the left appears only while a Pioneer has nothing to do; **.** selects the next one.*

### Commands, costs and tooltips

Each button on the command card shows its hotkey in the corner. Hover one for the cost in crystal, aether and supply, the build time and a description. Buttons you cannot use yet are dimmed, and the tooltip says why.

![Tooltip for Train Breacher showing cost, stats and description]({{ '/assets/images/robos-rts/08-command-card-tooltip.jpg' | relative_url }}){: .robos-zoomable-img }

### Production

Structures have a five-slot production queue. The first slot shows progress. The structure also shows a progress bar in the world while it is producing.

![Muster Hall with four units queued]({{ '/assets/images/robos-rts/07-production-queue.jpg' | relative_url }}){: .robos-zoomable-img }

When you cannot afford something, or you are at your supply cap, the game says so:

![Supply shown in red at 15 of 15 with the message "Supply blocked"]({{ '/assets/images/robos-rts/14-supply-blocked.jpg' | relative_url }}){: .robos-zoomable-img }

### Building

Select a Pioneer, press the build hotkey and place the structure. The footprint turns green where you can build and red where you cannot, and a click on an invalid spot tells you why. Aether Taps snap to a free aether vent.

![Placement footprint shown in green for a Provision Silo]({{ '/assets/images/robos-rts/09-build-placement.jpg' | relative_url }}){: .robos-zoomable-img }

![Placement footprint in red next to a crystal field, with the message "Too close to a resource"]({{ '/assets/images/robos-rts/10-build-placement-blocked.jpg' | relative_url }}){: .robos-zoomable-img }

![A Provision Silo under construction with a progress bar in the selection panel]({{ '/assets/images/robos-rts/11-construction-in-progress.jpg' | relative_url }}){: .robos-zoomable-img }

### Other views

![The whole canyon at maximum zoom with the minimap showing the camera outline]({{ '/assets/images/robos-rts/03-canyon-overview.jpg' | relative_url }}){: .robos-zoomable-img }

*Zoomed out with the mouse wheel. The white outline on the minimap is the camera. Left click on the minimap jumps there; right click gives orders.*

![The controls overlay opened with F1]({{ '/assets/images/robos-rts/13-controls-overlay.jpg' | relative_url }}){: .robos-zoomable-img }

## Economy

Pioneers gather **crystal** from fields and **aether** through an Aether Tap built on a vent, and carry it back to the nearest main base. Supply comes from main bases and Provision Silos; units and queued units count against it.

![Pioneers mining crystal beside the Colony Hub]({{ '/assets/images/robos-rts/02-gathering-crystal.jpg' | relative_url }}){: .robos-zoomable-img }

![An Aether Tap on a vent beside the Workshop]({{ '/assets/images/robos-rts/22-aether-tap.jpg' | relative_url }}){: .robos-zoomable-img }

## Map

Starfall Canyon has two levels. The Meridian Guard start on a sandstone plateau; the Gnarl Brood and the Aurelian Concord start on the low ground to the east. A single ramp connects them, flanked by cliff walls that ground units cannot cross.

![A squad walking down the ramp from the plateau to the low ground]({{ '/assets/images/robos-rts/04-ramp-descent.jpg' | relative_url }}){: .robos-zoomable-img }

A Provision Silo can be retracted into the ground so units can walk over it, or extended to block the path again:

![An extended Provision Silo blocking a gap between two cliffs]({{ '/assets/images/robos-rts/31-silo-gate-extended.jpg' | relative_url }}){: .robos-zoomable-img }
![The same silo retracted, with a Howitzer driving over it]({{ '/assets/images/robos-rts/32-silo-gate-retracted.jpg' | relative_url }}){: .robos-zoomable-img }

## Factions

The three factions are asymmetric rather than reskins of each other. Costs are crystal, then aether. Damage shows attacks per volley where a weapon fires more than once.

### Meridian Guard

Human colonists. Cheap infantry, armored line troops and artillery. Rifleman and Breacher can use **Surge Injector**, which costs 10 health for 11 seconds of faster movement and fire. A Howitzer can **emplace** to reach range 31 with splash damage, at the price of being unable to move.

![Pioneer, Rifleman, Breacher, Howitzer and an emplaced Howitzer]({{ '/assets/images/robos-rts/15-roster-meridian-guard.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Pioneer | 50 | 1 | 45 | 0 | 5 | 1.6 | Builds structures and gathers crystal and aether. Fragile; keep it out of fights. |
| Rifleman | 50 | 1 | 45 | 0 | 6 | 12.5 | Cheap ranged infantry. Surge Injector trades 10 HP for faster movement and fire rate. Strong when kiting melee units. |
| Breacher | 100 / 25 | 2 | 125 | 0 | 10 | 14.5 | Armored line infantry. Breach Charges deal bonus damage to armored targets and slow them. |
| Howitzer (mobile) | 150 / 125 | 3 | 175 | 0 | 15 | 16.5 | Mobile artillery. Emplace it to reach range 31 with splash damage. |
| Howitzer (Emplaced Mode) | 150 / 125 | 3 | 175 | 0 | 40 | 31.0 | Deployed artillery. Range 31 with splash damage, minimum range 5. Cannot move until mobilized. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Colony Hub | 400 | +15 | 1500 | 0 | Main base. Trains Pioneers, receives gathered resources and provides 15 supply. |
| Provision Silo | 100 | +8 | 400 | 0 | Provides 8 supply. Extended, it blocks the path; retract it to let units through. |
| Provision Silo (Retracted) | 100 | +8 | 400 | 0 | Provides 8 supply. Retracted into the ground, so units can walk over it. |
| Aether Tap | 75 | - | 500 | 0 | Extracts aether from a vent. Pioneers carry it back to the Colony Hub. |
| Muster Hall | 150 | - | 1000 | 0 | Trains Riflemen and Breachers. Requires a Provision Silo. |
| Workshop | 150 / 100 | - | 1250 | 0 | Builds Howitzers. Requires a Muster Hall. |

![Colony Hub, Muster Hall and Workshop]({{ '/assets/images/robos-rts/18-structures-meridian-guard.jpg' | relative_url }}){: .robos-zoomable-img }

![Provision Silo extended and retracted, and an Aether Tap]({{ '/assets/images/robos-rts/19-structures-silo-and-aether-tap.jpg' | relative_url }}){: .robos-zoomable-img }

### Gnarl Brood

A monster swarm. Fast, cheap units that overwhelm in numbers and are punished by splash damage. They have one main structure, the Brood Nest, which spawns every unit.

![Forager, Skitterling, Bile Crawler and Blight Hurler]({{ '/assets/images/robos-rts/16-roster-gnarl-brood.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Forager | 50 | 1 | 40 | 0 | 5 | 1.6 | Worker. Gathers crystal and returns it to the Brood Nest. |
| Skitterling | 25 | 1 | 35 | 0 | 5 | 1.9 | Very fast, cheap melee swarm unit. Dangerous in numbers, weak to splash damage. |
| Bile Crawler | 75 / 25 | 2 | 145 | 0 | 16 | 10.5 | Armored acid spitter with mid range. Good against structures and armored units. |
| Blight Hurler | 100 / 100 | 3 | 120 | 0 | 18 | 15.0 | Lobs corrosive blight that splashes. Bonus damage to structures. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Brood Nest | 300 | +15 | 1500 | 0 | Monster main base. Spawns Foragers, Skitterlings, Bile Crawlers and Blight Hurlers. |

![The Brood Nest with its Foragers and crystal fields]({{ '/assets/images/robos-rts/20-brood-base.jpg' | relative_url }}){: .robos-zoomable-img }

### Aurelian Concord

Shielded warriors. Every unit and structure has an Aegis Shield that absorbs damage first and regenerates after a few seconds out of combat; a faint bubble flashes when it takes a hit. Skirmishers can **Phase Step** to teleport 18 range, and the Spire Walker steps over cliff walls.

![Mote, Sunblade, Skirmisher and Spire Walker]({{ '/assets/images/robos-rts/17-roster-aurelian-concord.jpg' | relative_url }}){: .robos-zoomable-img }

| Unit | Crystal / aether | Supply | Health | Shield | Damage | Range | Role |
|:---|---:|---:|---:|---:|---:|---:|:---|
| Mote | 50 | 1 | 20 | 20 | 5 | 1.8 | Worker. Gathers crystal and summons structures that complete on their own. |
| Sunblade | 100 | 2 | 100 | 50 | 16x2 | 2.1 | Shielded melee warrior with twin light blades. Rush closes the gap quickly. |
| Skirmisher | 125 / 50 | 2 | 80 | 80 | 13 | 15.5 | Shielded ranged unit. Phase Step teleports it out of danger or onto high ground. |
| Spire Walker | 300 / 200 | 6 | 200 | 150 | 20x2 | 21.0 | Towering walker with splash prism beams. Strong against light units and can step over cliff walls. |

| Structure | Crystal / aether | Supply | Health | Shield | Role |
|:---|---:|---:|---:|---:|:---|
| Heartstone | 400 | +15 | 1000 | 1000 | Aurelian main base. Summons Motes and provides 15 supply. |
| Resonator | 100 | +8 | 200 | 200 | Provides 8 supply. |
| Waystone | 150 | - | 500 | 500 | Summons Sunblades, Skirmishers and Spire Walkers. |

![The Heartstone, Resonator and Waystone]({{ '/assets/images/robos-rts/21-concord-base.jpg' | relative_url }}){: .robos-zoomable-img }

![Brood Nest beside the Concord structures]({{ '/assets/images/robos-rts/19b-structures-brood-and-concord.jpg' | relative_url }}){: .robos-zoomable-img }

## Combat

Weapons have a wind-up before damage lands and a recovery after it. Moving during the recovery cancels it, which is what makes stutter-step kiting work: the built-in AI does it, and so can a player or a bot.

![Riflemen holding range against a pack of Skitterlings]({{ '/assets/images/robos-rts/26-kiting-approach.jpg' | relative_url }}){: .robos-zoomable-img }
![Riflemen firing while backing away]({{ '/assets/images/robos-rts/27-kiting-volley.jpg' | relative_url }}){: .robos-zoomable-img }

An emplaced Howitzer line at the canyon choke deals splash damage to a wave. The dark discs are scorch marks left where units died; they fade after a while.

![Three emplaced Howitzers with Rifleman spotters]({{ '/assets/images/robos-rts/23-howitzer-line-emplaced.jpg' | relative_url }}){: .robos-zoomable-img }
![A splash shell leaving a Howitzer]({{ '/assets/images/robos-rts/24-howitzer-splash-volley.jpg' | relative_url }}){: .robos-zoomable-img }
![The same position after the wave has been destroyed]({{ '/assets/images/robos-rts/25-howitzer-aftermath.jpg' | relative_url }}){: .robos-zoomable-img }

Aurelian Skirmishers keep their shields up by teleporting out when a shield breaks, and a Spire Walker can walk straight across the cliff wall:

![Skirmishers and a Spire Walker advance toward a Brood pack]({{ '/assets/images/robos-rts/28-concord-advance.jpg' | relative_url }}){: .robos-zoomable-img }
![A Skirmisher mid Phase Step]({{ '/assets/images/robos-rts/29-phase-step-burst.jpg' | relative_url }}){: .robos-zoomable-img }
![A Spire Walker firing across a cliff wall it has just walked over]({{ '/assets/images/robos-rts/30-spire-walker-cliff-walk.jpg' | relative_url }}){: .robos-zoomable-img }

When something of yours is hit, the minimap pings and the game says so; **Space** jumps the camera there.

![A three-way battle with all three built-in AIs enabled]({{ '/assets/images/robos-rts/33-three-way-battle.jpg' | relative_url }}){: .robos-zoomable-img }

## Controls

| Input | Action |
|:---|:---|
| Left click or drag | Select; drag for a box |
| Double click | Select all of that type on screen |
| Right click | Move, attack, gather, or set a rally point |
| Shift | Queue orders; add to or remove from the selection |
| Mouse wheel, middle drag | Zoom, pan |
| Arrow keys | Pan |
| Letter in a button's corner | Use that command |
| Ctrl + 1 to 9, 1 to 9 | Set, recall a control group |
| Tab | Cycle the active unit type |
| **.** | Select the next idle worker |
| Space | Jump to the last attack alert, or home |
| Esc | Cancel placement or targeting |
| F1 | Controls overlay |
| F2 | Switch the viewed faction |
| F5, F6, F7 | Toggle the built-in AI for the Meridian Guard, Gnarl Brood and Aurelian Concord |

## Scripting and bots

The game runs an HTTP/JSON server (port 18095, or `RTS_WEB_SERVICE_PORT`). The Cucumber tests and external bots use the same endpoints, and the Python SDK `robos_rts_bot_sdk.py` wraps them:

| Endpoint | Purpose |
|:---|:---|
| `GET /health`, `POST /observation` | Status; full observation of units, resources and players |
| `POST /action` | Issue a command to unit tags, or to every unit of a type and owner |
| `POST /step`, `POST /pause` | Advance ticks; pause real-time play (`/step` still works) |
| `POST /scenario` | Load a scenario by slug (`default` for the main map) or an inline definition |
| `POST /directive` | Turn a built-in AI mode on or off for a player |
| `POST /select`, `POST /camera`, `POST /ui` | Selection, camera and HUD state |
| `POST /input` | Inject mouse and key events through the real input handlers |
| `POST /screenshot` | Save the current frame as PNG |

```python
from robos_rts_bot_sdk import RTSClient

c = RTSClient("127.0.0.1", 18095)
c.load_scenario_slug("stutter-step-micro")
c.step(120)
riflemen = [u["tag"] for u in c.get_observation()["units"] if u["unit_type"] == "rifleman"]
c.command("attack_move", tags=riflemen, x=70.0, y=40.0)
```

Scenarios are JSON-LD files in `games/robos-rts/scenarios`. Besides units, resources and map obstacles, a scenario can set `paused` and `decor`; the two roster scenarios use both.

## Tests

`games/robos-rts/tests/e2e/features/engine` holds six Cucumber scenarios: crowd steering through a gate, stutter-step kiting, Howitzer splash defense, Phase Step and cliff walking, the crystal-to-Riflemen economy, and a three-AI battle that guards against a pathfinding stall. They run headless in a few seconds.

## Regenerating these screenshots

Every image on this page is a frame from the game itself. `games/robos-rts/capture_screenshots.py` starts the game under Xvfb, drives it through `/input`, `/ui` and `/step`, and writes the JPEGs:

```bash
games/robos-rts/capture_screenshots.py --only 05,06
```

It needs `xvfb-run`, Godot 4.3 and Pillow.
