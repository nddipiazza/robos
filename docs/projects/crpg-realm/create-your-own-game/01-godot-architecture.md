---
title: "1. Godot 4 Architecture"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 1
permalink: /projects/crpg-realm/create-your-own-game/01-godot-architecture.html
description: The real node tree of a crpg-realm location scene, the six autoloads, and the flat-scene rule every other system depends on.
---

# 1. Godot 4 Architecture for Programmers
{: .no_toc }

This chapter maps the Godot concepts you need onto the actual crpg-realm code. After it you will be able to read any location scene, know which globals exist and which don't, and understand why gameplay nodes must sit directly under the scene root.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

### Scenes, nodes and scripts

Godot builds everything from a tree of nodes. A `.tscn` file is a saved subtree; a `.gd` script attached to a node adds behaviour. At any moment exactly one scene is the *current scene* (`get_tree().current_scene`). Changing location means replacing it with `get_tree().change_scene_to_file("res://scenes/X.tscn")`.

In crpg-realm each location — `Homestead`, `VillageSquare`, `WhisperingForest`, `AncientCatacombs`, `GarrisonKeep` — is one `.tscn` in `scenes/` with a matching script in `scripts/`.

### The real tree of a location scene

This is `scenes/AncientCatacombs.tscn`, trimmed only by collapsing repeated siblings. Note that it is flat: there is no "Entities" or "YSort" container.

```text
AncientCatacombs (Node2D, y_sort_enabled = true, script = AncientCatacombs.gd)
├── CombatManager (Node, script = CombatManager.gd)
├── Ground (TextureRect, 2560×1440, mouse_filter = 2)
├── CatacombBoundaries (StaticBody2D, layer 1)
│   ├── WestBorder / EastBorder / NorthBorder / SouthBorder (CollisionShape2D)
│   └── WallLeftVault / WallRightVault (CollisionShape2D)
├── ForestExit (DoorPortal.tscn instance)
├── KeepSecretPassage (DoorPortal.tscn instance, is_locked = true)
├── GrandSarcophagus (Area2D, script = TreasureChest.gd)
├── GroundItem_CryptKey, GroundItem_CryptPotion (GroundItem.tscn instances)
├── PoisonDartTrap, GlyphOfWarding, SpikePitTrap (Trap.tscn instances)
├── HeroPlayer (HeroPlayer.tscn instance, has its own Camera2D)
├── SirJustinGhost (NPCCharacter.tscn instance)
├── SkeletonArcher, CryptGuardian (ShadowHound.tscn instances)
├── CanvasLayer
│   ├── NoticeLabel (Label)
│   ├── PartyHUD (Panel, script = PartyHUD.gd)
│   │   └── QuestLabel, BtnOptions, BtnInventory, BtnPause
│   ├── ActionLog (ActionLog.tscn instance)
│   ├── InventoryWindow, SettingsModal, CharacterStatusWindow (hidden)
└── FogOfWar (FogOfWar.tscn instance)
```

Some nodes you see in the running game are not in the `.tscn` at all. They are created in code when the scene starts:

| Node | Created by | Where it ends up |
|:---|:---|:---|
| `PortraitToolbar` | `PartyHUD._setup_toolbars()` | child of `CanvasLayer` |
| `ActionToolbar` | `PartyHUD._setup_toolbars()` | child of `PartyHUD` |
| `ShopWindow`, `CharacterStatusWindow` | `PartyHUD._setup_toolbars()` (only if missing) | child of `CanvasLayer` |
| `PartyCompanion` | the location script's `_ready()` when the party has more than one member | child of the scene root |

`FogOfWar` is a root child, not part of the UI. It sets `z_index = 25` in its `_ready()` so it draws over the map and actors.

### Y-sorting

The root has `y_sort_enabled = true`, so Godot draws its children in order of their `y` position: a node lower on screen is drawn in front. For this to look right, each actor's origin must be at its feet. `Ground` is a `TextureRect` at `(0, 0)`, so it always sorts first and stays behind everything.

Y-sorting only applies between siblings. That is one reason actors stay directly under the root.

### Why the scene must stay flat

Several systems look for gameplay nodes with `get_tree().current_scene.get_children()`, which returns direct children only:

- `GameState.get_scene_traps()` — trap detection and the `traps` list in `/api/v1/state`.
- `GameControlServer._get_full_game_state()` — the `battle.enemies` list.
- Fireball targeting in `CombatManager` and pack alerts in `TacticalEnemy`.

If you move enemies or traps under a grouping node, these systems stop seeing them. Nothing errors; they just silently disappear from the game logic.

### Autoloads (global singletons)

Autoloads are nodes Godot creates once at startup under `/root`. They survive scene changes. crpg-realm has six, defined in `project.godot`:

[project.godot](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/project.godot)

```ini
[autoload]

DataStore="*res://src/generated/v1/DataStoreV1.gd"
GameState="*res://scripts/GameState.gd"
GameControlServer="*res://scripts/GameControlServer.gd"
AudioManager="*res://scripts/AudioManager.gd"
QAOverlay="*res://scripts/QAOverlay.gd"
FloatingTextManager="*res://scripts/FloatingTextManager.gd"
```

| Autoload | What it holds |
|:---|:---|
| `DataStore` | Everything from `data/v1/*.json`, keyed by id. `DataStore.items["dagger"]` returns an `ItemData` object, not a Dictionary. Also loads mods. |
| `GameState` | Persistent run state: hero stats, `inventory` (an Array of item ids), equipped slots, `party_members`, `quest_stage`, `flags`, `spawn_position`, formation and leader, status effects, pause. |
| `GameControlServer` | The HTTP control API (port 8080 by default, 18090 in tests). |
| `AudioManager` | `play_sfx(key)`; unknown keys do nothing. |
| `QAOverlay` | The test overlay that shows the current BDD step and simulated cursor. |
| `FloatingTextManager` | Floating combat numbers. |

**Not autoloads:**

- `CombatManager` (`scripts/CombatManager.gd`, `class_name CombatManager`, extends `Node`) is a child node of each combat scene. Scene scripts reach it as `$CombatManager`.
- `Pathfinder` (`scripts/Pathfinder.gd`) is a `RefCounted` class with static functions. `HeroPlayer.gd` and `PartyCompanion.gd` `preload` it.

### What a location script does

Every location script follows the same pattern. Here is the start of `AncientCatacombs.gd`:

[scripts/AncientCatacombs.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/AncientCatacombs.gd)

```gdscript
extends Node2D

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var hero = $HeroPlayer
@onready var sarcophagus = $GrandSarcophagus
# ...

func _ready() -> void:
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 2560, 1440)
	hud.update_display("Active Quest: Breach Royal Sarcophagus & Enter Citadel")

	if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene:
			var comp = comp_scene.instantiate()
			comp.global_position = hero.global_position + Vector2(-48, 24)
			add_child(comp)
			if has_node("FogOfWar"):
				$FogOfWar.register_actor(comp)

	if sarcophagus:
		sarcophagus.chest_opened.connect(func():
			GameState.add_item("garrison-key")
			show_notice("Recovered Ancient Garrison Key from the Royal Sarcophagus!")
			# ...
		)
	# ... wire traps and enemies, register actors with FogOfWar

func get_nav_points() -> Array[Vector2]:
	return [
		Vector2(240, 680),
		Vector2(420, 680),
		# ...
	]
```

In order, `_ready()`: clamps the camera, sets the quest text, spawns the companion, connects signals from objects in the scene, and registers actors with the fog. `get_nav_points()` supplies waypoints to the pathfinder ([chapter 3]({{ '/projects/crpg-realm/create-your-own-game/03-maps-and-isometric-geometry.html' | relative_url }})).

Children run `_ready()` before their parent. So by the time the location's `_ready()` runs, `HeroPlayer._ready()` has already moved the hero to `GameState.spawn_position`, and the companion spawns next to the correct spot.

### GDScript you will see everywhere

**Signals.** Components declare signals; the location script connects to them. From `DoorPortal.gd`:

[scripts/DoorPortal.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/DoorPortal.gd)

```gdscript
signal door_entered
signal door_unlocked
# ...
	door_entered.emit()
```

and in `Homestead.gd`: `door.door_entered.connect(try_exit_to_village)`.

**`await`.** Used for timed notices, from `AncientCatacombs.show_notice()`:

```gdscript
func show_notice(text: String) -> void:
	msg_label.text = text
	msg_label.visible = true
	await get_tree().create_timer(3.0).timeout
	msg_label.visible = false
```

**Typed arrays.** Enemy patrol routes and nav points are `Array[Vector2]`. The scenes build a typed local first and then assign it, so the value matches the typed `@export var waypoints: Array[Vector2]` on the enemy:

```gdscript
var wa: Array[Vector2] = [Vector2(1100, 640), Vector2(1200, 640)]
archer.waypoints = wa
```

**Global state calls.** `GameState.add_item(item_id)` takes one argument and appends one copy. `GameState.log_message(category, msg)` writes to the activity log.

---

## Step by step: inspect a running scene

1. Open `games/crpg-realm/project.godot` in the Godot 4.3 editor. Open `scenes/AncientCatacombs.tscn` and compare the Scene dock with the tree above.
2. Launch the scene directly:
   ```bash
   ./debug.sh --scene res://scenes/AncientCatacombs.tscn
   ```
   `debug.sh` passes any `res://` path through to Godot. Only `Homestead`, `VillageSquare`, `GarrisonKeep` and `VictoryScreen` are accepted as short names.
3. In the running game, open the editor's **Remote** scene tab (Debugger). You will now see `PortraitToolbar` under `CanvasLayer` and `ActionToolbar` under `PartyHUD` — the runtime-created nodes.
4. Query the game from a terminal:
   ```bash
   curl -s http://127.0.0.1:8080/api/v1/state | python3 -m json.tool | head -40
   ```
   `scene.name` is the root node's name (`AncientCatacombs`) and `traps` lists the three trap nodes found under the root.
5. Experiment: in the editor, add a plain `Node2D` named `Group` under the root, drag `PoisonDartTrap` into it, and run again. The `traps` list in `/api/v1/state` now has two entries. Undo the change.

---

## Verify it

The full-campaign feature exercises every location's `_ready()` wiring, the autoloads and scene changes:

```bash
python3 run_cucumber_tests.py tests/e2e/features/full_playthroughs/01_human_fighter_full_playthrough.feature
```

Open `tests/e2e/reports/index.html` for the step results and the recorded video.

---

## Gotchas

- **`CombatManager` is not global.** `CombatManager.execute_attack(...)` refers to the class, not an instance, and GDScript rejects calling a non-static method that way. Add a `CombatManager` child node to your scene and use `$CombatManager`.
- **Don't nest gameplay nodes.** Traps, enemies, NPCs, items, doors and companions go directly under the root, or the trap scan, state API, fireball and pack alerts miss them.
- **`Ground` must ignore the mouse.** Keep `mouse_filter = 2` (Ignore) on the map `TextureRect`. Otherwise it swallows clicks before `HeroPlayer._unhandled_input()` sees them and click-to-move stops working.
- **The root node's name matters.** Tests assert `the current scene is "X"` against the root node name, not the file name.
- **`@onready` paths are literal.** Scripts use `$CanvasLayer/ActionLog`, `$CanvasLayer/PartyHUD`, `$HeroPlayer`, `$CombatManager`. Renaming those nodes breaks the script with a null reference.

---

[← Guide overview]({{ '/projects/crpg-realm/create-your-own-game.html' | relative_url }}) · [Next: 2. Scenes and door portals →]({{ '/projects/crpg-realm/create-your-own-game/02-scenes-and-portals.html' | relative_url }})
