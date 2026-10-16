---
title: Extending the CRPG
layout: default
parent: Realm of Heroes CRPG
grand_parent: Projects
has_children: true
nav_order: 6
permalink: /projects/crpg-realm/create-your-own-game.html
description: How to change the Realm of Heroes Godot project - add locations, items, traps, enemies and spells to the hand-built scenes, with the rules the code depends on.
redirect_from:
  - /projects/crpg-realm/create-your-own-game/12-step-by-step-game-creation-recipe.html
---

# Extending the CRPG
{: .no_toc }

How to add locations, items, traps, enemies and spells to the hand-built scenes of `games/crpg-realm`, and what the code assumes about a scene. You need to read GDScript and work in the Godot 4.3 editor. For data-only authoring, use the [campaign editor]({{ '/projects/crpg-realm/campaign-editor-tutorial.html' | relative_url }}).
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Pick a route

| You want to | Use |
|:---|:---|
| Add maps, characters or items as data and play them | The [editor and cartridges]({{ '/projects/crpg-realm/campaign-editor-tutorial.html' | relative_url }}). Read its last section first: NPCs and quests in cartridges are still coded per story. |
| Add a rule, spell, monster or AI behaviour and prove it with a test | `data/v1/*.json`, `ScenarioEngine.gd` and a feature in `tests/e2e/features/engine/`. See [testing]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }}). |
| Add a location, trap, enemy or spell to the real-time scenes | This guide and its three pages. |

The three pages:

1. [Scenes, doors and maps]({{ '/projects/crpg-realm/create-your-own-game/scenes-and-maps.html' | relative_url }}): the scene tree, `DoorPortal`, collision and camera.
2. [Items, traps and mods]({{ '/projects/crpg-realm/create-your-own-game/items-traps-and-mods.html' | relative_url }}): `items.json`, ground items and chests, `Trap`, and the mod loader.
3. [Combat, party and spells]({{ '/projects/crpg-realm/create-your-own-game/combat-party-and-spells.html' | relative_url }}): attack math, the Malakor fight, formations, enemy threat and the spell code.

## Where things live

| Path in `games/crpg-realm/` | What it holds |
|:---|:---|
| `project.godot` | Engine settings, main scene (`CharacterSelect.tscn`) and the ten autoloads |
| `scripts/` | One script per location (`VillageSquare.gd`, `AncientCatacombs.gd`, ...), components (`DoorPortal.gd`, `Trap.gd`, `TacticalEnemy.gd`, `GroundItem.gd`), `GameState.gd`, `CombatManager.gd`, `Pathfinder.gd`, `FogOfWar.gd`, `GameControlServer.gd` |
| `scripts/engine/`, `scripts/demo/` | The scenario engine, dice, cartridge manager and demo mode |
| `scenes/` | One `.tscn` per location, plus `HeroPlayer.tscn`, `PartyCompanion.tscn`, `ShadowHound.tscn`, `CharacterSelect.tscn`, `VictoryScreen.tscn`, `CartridgeWorld.tscn` |
| `scenes/components/` | Building blocks to instance: `DoorPortal`, `Trap`, `GroundItem`, `TacticalEnemy`, `NPCCharacter`, `FogOfWar`, `ActionLog`, windows and toolbars |
| `data/v1/` | JSON content arrays. Which code reads which file is on the [reference page]({{ '/projects/crpg-realm/reference.html#data-v1-files' | relative_url }}). |
| `src/generated/v1/` | `DataStoreV1.gd` and the typed wrappers `ItemData`, `SpellData`, `MonsterData`, `NPCData` |
| `mods/` | Drop-in mods. The loader reads only a `traps_file`. |
| `tests/e2e/` | `behave` features, step definitions in `features/steps/`, the report generator |

{: .warning }
`DataStoreV1.gd` starts with "Auto-generated", but it has been edited by hand (races, traps, mod loading). Do not regenerate it with `packages/crpg-builder`. The generator template would overwrite those edits.

## Rules the code depends on

Breaking these does not raise an error. The affected feature just stops seeing your nodes.

- Keep gameplay nodes flat. Enemies, traps, NPCs, ground items, doors and companions must be direct children of the scene root. `GameState.get_scene_traps()`, the `battle.enemies` list in `/api/v1/state`, fireball targeting, enemy pack alerts and party lookup all scan `get_tree().current_scene.get_children()`. A trap under a `Traps` group node is never detected, and an enemy under an `Enemies` node never hears an alert.
- Add a `CombatManager` child node to any scene with combat. It is a `class_name`, not an autoload, and scene scripts reach it as `$CombatManager`.
- Name the player node `HeroPlayer`. `GameState.get_scene_party_nodes()`, `TacticalEnemy` and the HTTP API look it up by that name. Its `Camera2D` is the scene camera.
- The root node name is the scene name. `/api/v1/state` reports it, and the test step `the current scene is "X"` compares against it.
- Set `mouse_filter = 2` (Ignore) on the map's `Ground` node. Otherwise it swallows clicks before `HeroPlayer._unhandled_input` sees them and click-to-move stops working.
- Put content in `data/v1/*.json`, but expect some behaviour to be keyed by id in code. Potion effects are in `GameState.use_item()`, spells in `CombatManager.gd`. Adding JSON alone is not always enough; each page says when.

## Checklist: a new location

This is the shortest path to a new playable scene. The details of each step are on the three pages above. Duplicating an existing scene in the Godot editor is safer than writing a `.tscn` by hand.

1. Duplicate a scene. In the FileSystem dock, right-click `scenes/AncientCatacombs.tscn` and choose Duplicate. Rename the file and its root node (the root name must match the file name for tests). Delete the catacomb children you do not want (the traps, the sarcophagus, the skeleton and guardian, the two ground items, `KeepSecretPassage`).
2. Keep what scripts look up by path: `CombatManager`, `Ground`, the boundary `StaticBody2D`, `HeroPlayer`, and under `CanvasLayer` the `NoticeLabel`, `PartyHUD` (with `QuestLabel`, `BtnOptions`, `BtnInventory`, `BtnPause`), `ActionLog`, `InventoryWindow`, `SettingsModal` and `CharacterStatusWindow`. Keep `FogOfWar` if you want fog.
3. Write the scene script. Attach a new script that follows the start of `AncientCatacombs.gd`:

   ```gdscript
   extends Node2D

   @onready var hud = $CanvasLayer/PartyHUD
   @onready var hero = $HeroPlayer

   func _ready() -> void:
       if hero and hero.has_method("set_camera_limits"):
           hero.set_camera_limits(0, 0, 2560, 1440)
       hud.update_display("Active Quest: Explore the new room")

       if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
           var comp_scene = load("res://scenes/PartyCompanion.tscn")
           if comp_scene:
               var comp = comp_scene.instantiate()
               comp.global_position = hero.global_position + Vector2(-48, 24)
               add_child(comp)
               if has_node("FogOfWar"):
                   $FogOfWar.register_actor(comp)
   ```

   This is a sketch derived from `AncientCatacombs.gd`. Run the scene in the editor to check it. Use the size of your own map plate for the camera limits, and set the same size on `FogOfWar.map_width` and `map_height`.
4. Connect it with doors. Instance `scenes/components/DoorPortal.tscn` directly under the root of both scenes. Set `door_id`, `door_name`, `target_scene` (`res://scenes/YourScene.tscn`) and `target_spawn` (the position where the hero should appear). Details and pitfalls are on [Scenes, doors and maps]({{ '/projects/crpg-realm/create-your-own-game/scenes-and-maps.html#doors' | relative_url }}).
5. Add content. Ground items, chests, traps, enemies and NPCs are on the other two pages.
6. Run it: `./debug.sh --scene res://scenes/YourScene.tscn`. The short names in `debug.sh` cover only five scenes.
7. Test it. Add a feature under `tests/e2e/features/normal/`. These steps exist in `crpg_steps.py` and `infinity_ai_steps.py`:

   ```gherkin
   Feature: Your location portals

     Background:
       Given the cRPG game is running and healthy

     Scenario: Travel from the catacombs to the new room and back
       Given an isolated test starting in scene "AncientCatacombs" with party "Lieutenant Vance" the "fighter"
       Then the current scene is "AncientCatacombs"
       When the infinity ai agent enters door "door-id-your-room"
       Then the current scene is "YourScene"
       When the infinity ai agent enters door "door-id-your-room-exit"
       Then the current scene is "AncientCatacombs"
   ```

   Scenario names must be unique across all features, because the video file name comes from the name. Run it with `python3 run_cucumber_tests.py tests/e2e/features/normal/<your-file>.feature`. The `enters door` step finds the node by `door_id`, walks the hero to it and calls `try_enter()`.

## Drive the game over HTTP

The "verify it" steps on the other pages use the control server. It listens on port 8080 by default (18090 under the test harness).

```bash
curl -s http://127.0.0.1:8080/api/v1/health
curl -s -X POST http://127.0.0.1:8080/api/v1/setup_state \
     -H 'Content-Type: application/json' \
     -d '{"scene": "AncientCatacombs", "name": "Lieutenant Vance", "class": "fighter", "companions": ["elora"]}'
curl -s http://127.0.0.1:8080/api/v1/state | python3 -m json.tool | head -40
```

`setup_state` re-initialises the hero and loads the scene. A bare scene name becomes `res://scenes/<name>.tscn`. The full endpoint and action list is on the [reference page]({{ '/projects/crpg-realm/reference.html#http-control-api' | relative_url }}).
