---
title: Creating Your Own Game
has_children: true
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
permalink: /projects/crpg-realm/create-your-own-game.html
nav_order: 4
description: A 12-chapter guide to building your own levels, items, traps, enemies and tests on top of the crpg-realm Godot 4.3 codebase.
---

# Creating Your Own Game with robos-crpg
{: .no_toc }

This guide teaches you to extend `games/crpg-realm` — a party-based isometric cRPG built with Godot 4.3 and GDScript — by adding your own locations, items, traps, enemies, spells and BDD tests. Each chapter explains how one system really works in the code, then walks you through a concrete change and the test that proves it.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Before you start

You need the game running locally and the test harness working. Follow the [Quick start]({{ '/projects/crpg-realm/quick-start.html' | relative_url }}) first; it covers installing Godot 4.3, launching the game, and running `python3 run_cucumber_tests.py`.

Keep these two pages open while you work:

- [Controls]({{ '/projects/crpg-realm/controls.html' | relative_url }}) — keyboard and mouse bindings.
- [Reference]({{ '/projects/crpg-realm/reference.html' | relative_url }}) — autoloads, data files, the HTTP control API, environment variables.

Some facts that apply to every chapter:

- The project is **Godot 4.3, GL Compatibility renderer, 1920×1080 viewport**. Location maps are painted at 2560×1440.
- The main scene is `res://scenes/CharacterSelect.tscn` (see `project.godot`).
- All commands in this guide run from `games/crpg-realm/`.

---

## How the codebase is organised

| Path | What lives there |
|:---|:---|
| `project.godot` | Engine settings, main scene, and the six autoloads (`DataStore`, `GameState`, `GameControlServer`, `AudioManager`, `QAOverlay`, `FloatingTextManager`). |
| `scripts/` | All GDScript: one script per location (`VillageSquare.gd`, `AncientCatacombs.gd`, …), reusable components (`DoorPortal.gd`, `Trap.gd`, `TacticalEnemy.gd`, `GroundItem.gd`), global state (`GameState.gd`), rules (`CombatManager.gd`), navigation (`Pathfinder.gd`) and the HTTP server (`GameControlServer.gd`). |
| `scenes/` | One `.tscn` per location plus `HeroPlayer.tscn`, `PartyCompanion.tscn`, `ShadowHound.tscn`, `CharacterSelect.tscn`, `VictoryScreen.tscn`. |
| `scenes/components/` | Instanceable building blocks: `DoorPortal`, `Trap`, `GroundItem`, `TacticalEnemy`, `NPCCharacter`, `FogOfWar`, `ActionLog`, `InventoryWindow`, toolbars and modal windows. |
| `data/v1/` | Game content as JSON arrays of objects with an `id` field: `items.json`, `spells.json`, `monsters.json`, `traps.json`, `dialogue.json`, `quests.json`, `races.json`, `classes.json`, and more. |
| `src/generated/v1/` | `DataStoreV1.gd` (the `DataStore` autoload that loads `data/v1/` and mods) and typed wrappers `ItemData`, `SpellData`, `MonsterData`, `NPCData`. |
| `mods/` | Drop-in mods. Each folder has a `mod.json`; today the loader only merges a `traps_file`. Example: `mods/catacomb-traps-mod/`. |
| `qa_player/` | The Python "Infinity AI" agent that plays the game over HTTP; used by the BDD steps. |
| `tests/e2e/` | Cucumber (behave) features under `features/normal`, `features/spells`, `features/full_playthroughs`, step definitions in `features/steps/`, and the report generator. |

{: .warning }
`src/generated/v1/DataStoreV1.gd` says "Auto-generated", but it has been edited by hand (races, traps, mod loading). Do not regenerate it with `packages/crpg-builder` — the template would overwrite those changes.

---

## Chapters

### Foundations

1. [Godot 4 architecture]({{ '/projects/crpg-realm/create-your-own-game/01-godot-architecture.html' | relative_url }}) — the real node tree of a location scene, the autoloads, and why every gameplay node sits directly under the scene root.
2. [Scenes and door portals]({{ '/projects/crpg-realm/create-your-own-game/02-scenes-and-portals.html' | relative_url }}) — the actual scene graph, how `DoorPortal` moves the party between scenes, and how to add a new location.
3. [Maps and isometric geometry]({{ '/projects/crpg-realm/create-your-own-game/03-maps-and-isometric-geometry.html' | relative_url }}) — map plates, foundation colliders, camera limits, and the `get_nav_points()` waypoints that make click-to-move work.
4. [Items, loot and inventory]({{ '/projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html' | relative_url }}) — the `items.json` format, `ItemData`, equip slots and AC, ground items and chests.

### Gameplay systems

5. [Traps]({{ '/projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html' | relative_url }}) — placing `Trap` instances, detection and disarm checks, and trap state in the HTTP API.
6. [Boss fights and encounters]({{ '/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html' | relative_url }}) — how the Malakor confrontation in `GarrisonKeep.gd` is scripted, and how to script your own.
7. [Modding and custom content]({{ '/projects/crpg-realm/create-your-own-game/07-modding-and-custom-content.html' | relative_url }}) — what the mod loader actually merges, and how to extend it.
8. [Cucumber BDD testing]({{ '/projects/crpg-realm/create-your-own-game/08-cucumber-bdd-testing.html' | relative_url }}) — running suites under Xvfb, writing steps against the HTTP API, reading the video report.
9. [Party dynamics and formations]({{ '/projects/crpg-realm/create-your-own-game/09-party-dynamics-and-formations.html' | relative_url }}) — party leader selection and the six `GameState.FORMATIONS`.
10. [Aggro, tactics and pack AI]({{ '/projects/crpg-realm/create-your-own-game/10-aggro-tactics-and-pack-ai.html' | relative_url }}) — `TacticalEnemy` states, threat tables, proximity aggro and pack alerts.
11. [Spells, AoE and magic]({{ '/projects/crpg-realm/create-your-own-game/11-spells-aoe-and-magic-systems.html' | relative_url }}) — how `CombatManager` resolves spells by id, and the Fireball AoE as a worked example.

### Capstone

12. [Build a dungeon end to end]({{ '/projects/crpg-realm/create-your-own-game/12-step-by-step-game-creation-recipe.html' | relative_url }}) — combine everything into a new playable level with its own feature file.

---

## Driving the game over HTTP

Every chapter's "Verify it" section relies on `GameControlServer.gd`, an HTTP server that starts inside the game. It listens on **port 8080** by default and tries the next nine ports if 8080 is busy. The test harness starts the game with `CRPG_WEB_SERVICE_PORT=18090`; you can also pass `--port 18090` on the Godot command line.

```bash
curl -s http://127.0.0.1:8080/api/v1/health
```

returns:

```json
{"status": "ok", "game": "Realm of Heroes: A Night Without Memory", "engine": "Godot 4.3", "port": 8080}
```

A few endpoints you will use often:

| Endpoint | Method | Example body | What it does |
|:---|:---|:---|:---|
| `/api/v1/state` | GET | — | Full snapshot: `scene`, `hero`, `inventory`, `party`, `traps`, `battle.enemies`, `flags`, `quest_stage`, … |
| `/api/v1/setup_state` | POST | `{"scene": "AncientCatacombs", "name": "Lieutenant Vance", "class": "fighter", "companions": ["elora"]}` | Re-initialises the hero and loads a scene. A bare scene name becomes `res://scenes/<name>.tscn`. |
| `/api/v1/reset` | POST | — (body ignored) | Resets the hero to "Lieutenant Vance" the fighter and returns to `CharacterSelect.tscn`. |
| `/api/v1/action` | POST | `{"action": "move_to", "args": {"x": 900, "y": 700}}` | Clicks to move the hero (`move` is an alias). |
| `/api/v1/action` | POST | `{"action": "move_party_formation", "args": {"x": 900, "y": 700, "queue": false}}` | Moves the party to a point in the current formation. |
| `/api/v1/action` | POST | `{"action": "set_party_leader", "args": {"leader": "elora"}}` | Sets the leader by id, name or `index`. |
| `/api/v1/action` | POST | `{"action": "set_party_formation", "args": {"formation": "wedge"}}` | One of `rank`, `wedge`, `line`, `column`, `square`, `scatter`. |
| `/api/v1/action` | POST | `{"action": "enter_door", "args": {"door_id": "door-id-forest"}}` | Walks to a `DoorPortal` and calls `try_enter()`. |
| `/api/v1/action` | POST | `{"action": "pickup_item", "args": {"item_id": "item-id-potion"}}` | Walks to a `GroundItem` and calls `pickup()`. |

The full list of endpoints and actions is on the [Reference]({{ '/projects/crpg-realm/reference.html' | relative_url }}) page.

---

## Conventions this guide follows

| Rule | Why |
|:---|:---|
| Put enemies, traps, NPCs, items, doors and companions **directly under the scene root**. | `GameState` trap scans, the `/api/v1/state` enemy list, fireball targeting and pack alerts iterate `get_tree().current_scene.get_children()` only. |
| Give every location a `get_nav_points() -> Array[Vector2]` function. | `Pathfinder.gd` builds its A* graph from these points. Without them, a blocked click falls back to a straight line. |
| Add a `CombatManager` child node to every location that has combat. | `CombatManager` is a `class_name`, not an autoload. Scene scripts reach it with `$CombatManager`. |
| Put content in `data/v1/*.json`, but expect some behaviour to be keyed by id in code. | For example, spells are resolved in `match` blocks in `CombatManager.gd`, and potion effects in `GameState.use_item()`. Adding JSON alone is not always enough; each chapter says when. |
| Verify every change with a feature file. | The BDD suite drives the real game through the HTTP API; it is the fastest way to catch a broken scene. |

---

## Interactive courses

- **[cRPG Game Builder Academy]({{ '/projects/crpg-realm/create-your-own-game/elearning/' | relative_url }})** — a self-paced course with quizzes that follows this guide. It also runs as a desktop app: `electron packages/crpg-game-builder-elearning`.
- **[Tactical cRPG course]({{ '/projects/crpg-realm/elearning/' | relative_url }})** — the rules and systems behind the game. Desktop app: `electron packages/robos-crpg-elearning`.
