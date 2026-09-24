---
title: "12. Build a Dungeon End to End"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 12
permalink: /projects/crpg-realm/create-your-own-game/12-step-by-step-game-creation-recipe.html
description: "A checklist for building a new dungeon scene end to end: scene file, script, portals, trap, loot, enemies, data entries and a BDD feature."
---

# 12. Build a Dungeon End to End
{: .no_toc }

This chapter is a checklist. You build a small dungeon, the Sunken Vault, reached from the Whispering Forest. It has a trap, a ground item, an NPC, a linked pair of `TacticalEnemy` ghouls and a portal in each direction, and it ships with a feature file that proves each part works. Every file, export and step phrase below exists in the repo; follow the steps in order.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## What you will create or edit

| File | Change |
|:--|:--|
| `scenes/SunkenVault.tscn` | New location scene |
| `scripts/SunkenVault.gd` | New scene script |
| `scenes/WhisperingForest.tscn` | One new `DoorPortal` into the vault |
| `data/v1/traps.json` | One new trap entry |
| `data/v1/items.json` | One new item entry |
| `tests/e2e/features/normal/18_sunken_vault_dungeon.feature` | New feature file |

All paths are relative to `games/crpg-realm/`.

## Rules the checklist follows

These come from the earlier chapters. Breaking any of them fails silently.

- **Flat scene.** The root is a `Node2D` with `y_sort_enabled = true`. Hero, companions, enemies, traps, NPCs, items and doors are **direct children** of the root. `GameState` trap detection, the `/api/v1/state` lists, fireball targeting, pack alerts and party lookup all scan `get_tree().current_scene.get_children()`. Do not group them under `YSortEntities`, `Enemies` or `Traps` nodes.
- **A `CombatManager` child.** `CombatManager` is not an autoload. Traps, attacks and spells look for a child node named `CombatManager` with `scripts/CombatManager.gd`.
- **The hero node is named `HeroPlayer`.** `GameState.get_scene_party_nodes()`, `TacticalEnemy` and the HTTP API find it by that name. Its `Camera2D` is the scene camera; there is no separate camera node.
- **The root node name is the scene name.** `/api/v1/state` reports `current_scene.name`, and the test step `the current scene is "..."` compares against it. Name the root `SunkenVault` and the file `SunkenVault.tscn`.
- **Components live in `scenes/components/`.** `DoorPortal.tscn`, `Trap.tscn`, `GroundItem.tscn`, `NPCCharacter.tscn`, `TacticalEnemy.tscn`, `ActionLog.tscn`, `InventoryWindow.tscn`, `SettingsModal.tscn`, `CharacterStatusWindow.tscn`. `HeroPlayer.tscn` and `PartyCompanion.tscn` are in `scenes/`. There is no `PartyHUD.tscn`: the HUD is a `Panel` with `scripts/PartyHUD.gd` attached, and it adds the `PortraitToolbar` and `ActionToolbar` itself at runtime.

## Layout

The vault is one 1920×1080 room. Positions were chosen so that the test paths do not cross each other:

| Node | Position | Why there |
|:--|:--|:--|
| `HeroPlayer` | (300, 540) | Start and spawn point |
| `VaultExit` door | (140, 540) | Close to the spawn point |
| `SunkenNeedleTrap` | (700, 760) | Within 650 px of the spawn (trap `detection_radius`), off the walking lines |
| `VaultIdol` item | (900, 300) | North of the main line |
| `VaultSpirit` NPC | (500, 300) | Out of the way |
| `GhoulLeader` | (1500, 540) | More than 280 px (`aggro_radius`) from the spawn |
| `GhoulLurker` | patrols (1750, 300)–(1750, 450) | Within 480 px (`pack_friend_radius`) of the leader, and linked by `friends` |

---

## Step by step

### 1. Add the data entries

A trap instance whose `trap_id` matches a `traps.json` entry takes its DCs and damage from the JSON (`Trap._sync_data_store()`), so put the numbers there.

New code — append to the array in `data/v1/traps.json`:
```json
{
  "id": "sunken-needle-trap",
  "title": "Rusted Needle Plate",
  "type": "floor",
  "detectDC": 12,
  "disarmDC": 13,
  "saveStat": "DEX",
  "saveDC": 12,
  "damageFormula": "2d4",
  "damageMin": 2,
  "damageMax": 8,
  "damageType": "piercing",
  "statusEffect": "",
  "statusDuration": 0,
  "description": "A pressure plate under the silt that drives rusted needles up through the floor."
}
```

New code — append to the array in `data/v1/items.json`:
```json
{
  "id": "item-id-vault-idol",
  "title": "Drowned Idol",
  "category": "quest",
  "equipSlot": "none",
  "cost": 0,
  "icon": "assets/icons/potions/potion_mana.png",
  "description": "A small green-stone idol recovered from the Sunken Vault."
}
```

Check both files still parse:
```bash
python3 -m json.tool data/v1/traps.json > /dev/null
python3 -m json.tool data/v1/items.json > /dev/null
```
`GameState.add_item()` works for any id, but without the `items.json` entry the log and inventory show the raw id instead of the title.

You do not need a `monsters.json` entry. `TacticalEnemy` reads only its exports. If you add one for bookkeeping, it must have the schema's required keys: `id`, `title`, `challengeRating`, `armorClass`, `hitPoints`, `abilities` (`STR`…`CHA`) and `attacks` (each with `name`, `attackBonus`, `damage`).

### 2. Write the scene script

New code — create `scripts/SunkenVault.gd`:
```gdscript
extends Node2D

@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr: CombatManager = $CombatManager
@onready var hero: HeroPlayer = $HeroPlayer

func _ready() -> void:
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 1920, 1080)
	hud.update_display("Active Quest: Recover the Drowned Idol")

	# Same pattern as AncientCatacombs.gd: bring one companion along if the party has one.
	if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene:
			var comp = comp_scene.instantiate()
			comp.global_position = hero.global_position + Vector2(-48, 24)
			add_child(comp)

	for child in get_children():
		if child is TacticalEnemy:
			child.body_clicked.connect(_on_enemy_clicked)

# Waypoints for Pathfinder.gd (AStar2D over these points when a straight line is blocked).
func get_nav_points() -> Array[Vector2]:
	return [
		Vector2(300, 540),
		Vector2(700, 540),
		Vector2(900, 380),
		Vector2(1200, 540),
		Vector2(1500, 700)
	]

func _on_enemy_clicked(enemy: TacticalEnemy) -> void:
	if enemy.current_state == TacticalEnemy.State.DEAD:
		enemy.loot_corpse(hero)
		return
	hero.attack_target(enemy, func():
		var res = combat_mgr.execute_attack(GameState.hero_name, 5, 4, 10, enemy.enemy_name, enemy.armor_class, enemy.global_position)
		if res.hit and is_instance_valid(enemy):
			enemy.take_damage(res.damage, hero)
		return res
	)
```

What each part relies on:

- `set_camera_limits(left, top, right, bottom)` is defined in `HeroPlayer.gd`. It also turns off camera smoothing.
- `PartyHUD.update_display(text)` sets the `QuestLabel`.
- `get_nav_points()` is optional but without it `Pathfinder.gd` can only try a straight line.
- `execute_attack(attacker_name, attack_bonus, damage_dice_min, damage_dice_max, target_name, target_ac, target_pos)` returns `{d20, total_attack, hit, crit, damage}` and already logs the roll and shows floating text.
- `take_damage(amount, hero)` passes the hero as attacker, so the ghoul builds threat and alerts its pack (chapter 10).

### 3. Create the scene file

Build this tree in the Godot editor, or save the text below as `scenes/SunkenVault.tscn`. The ext_resource ids are local to this file; any unique strings work.

New code — create `scenes/SunkenVault.tscn`:
```
[gd_scene load_steps=17 format=3]

[ext_resource type="Script" path="res://scripts/SunkenVault.gd" id="1_sv"]
[ext_resource type="Script" path="res://scripts/CombatManager.gd" id="2_cm"]
[ext_resource type="PackedScene" path="res://scenes/HeroPlayer.tscn" id="3_hp"]
[ext_resource type="PackedScene" path="res://scenes/components/DoorPortal.tscn" id="4_dp"]
[ext_resource type="PackedScene" path="res://scenes/components/TacticalEnemy.tscn" id="5_te"]
[ext_resource type="PackedScene" path="res://scenes/components/Trap.tscn" id="6_trap"]
[ext_resource type="PackedScene" path="res://scenes/components/GroundItem.tscn" id="7_itm"]
[ext_resource type="PackedScene" path="res://scenes/components/NPCCharacter.tscn" id="8_npc"]
[ext_resource type="Script" path="res://scripts/PartyHUD.gd" id="9_hud"]
[ext_resource type="PackedScene" path="res://scenes/components/ActionLog.tscn" id="10_al"]
[ext_resource type="PackedScene" path="res://scenes/components/InventoryWindow.tscn" id="11_inv"]
[ext_resource type="PackedScene" path="res://scenes/components/SettingsModal.tscn" id="12_sm"]
[ext_resource type="PackedScene" path="res://scenes/components/CharacterStatusWindow.tscn" id="13_csw"]
[ext_resource type="Texture2D" path="res://assets/icons/potions/potion_mana.png" id="14_idol"]

[sub_resource type="RectangleShape2D" id="RectangleShape2D_wall_v"]
size = Vector2(60, 1080)

[sub_resource type="RectangleShape2D" id="RectangleShape2D_wall_h"]
size = Vector2(1920, 80)

[node name="SunkenVault" type="Node2D"]
y_sort_enabled = true
script = ExtResource("1_sv")

[node name="CombatManager" type="Node" parent="."]
script = ExtResource("2_cm")

[node name="Floor" type="ColorRect" parent="."]
offset_right = 1920.0
offset_bottom = 1080.0
mouse_filter = 2
color = Color(0.1, 0.14, 0.16, 1)

[node name="VaultWalls" type="StaticBody2D" parent="."]
collision_layer = 1
collision_mask = 1

[node name="WestWall" type="CollisionShape2D" parent="VaultWalls"]
position = Vector2(30, 540)
shape = SubResource("RectangleShape2D_wall_v")

[node name="EastWall" type="CollisionShape2D" parent="VaultWalls"]
position = Vector2(1890, 540)
shape = SubResource("RectangleShape2D_wall_v")

[node name="NorthWall" type="CollisionShape2D" parent="VaultWalls"]
position = Vector2(960, 40)
shape = SubResource("RectangleShape2D_wall_h")

[node name="SouthWall" type="CollisionShape2D" parent="VaultWalls"]
position = Vector2(960, 1040)
shape = SubResource("RectangleShape2D_wall_h")

[node name="VaultExit" parent="." instance=ExtResource("4_dp")]
position = Vector2(140, 540)
door_id = "door-id-vault-exit"
door_name = "Stairs to the Forest"
target_scene = "res://scenes/WhisperingForest.tscn"
target_spawn = Vector2(620, 820)

[node name="SunkenNeedleTrap" parent="." instance=ExtResource("6_trap")]
position = Vector2(700, 760)
trap_id = "sunken-needle-trap"
trap_name = "Rusted Needle Plate"

[node name="VaultIdol" parent="." instance=ExtResource("7_itm")]
position = Vector2(900, 300)
item_id = "item-id-vault-idol"
item_name = "Drowned Idol"
icon_texture = ExtResource("14_idol")

[node name="VaultSpirit" parent="." instance=ExtResource("8_npc")]
position = Vector2(500, 300)
npc_id = "npc-id-vault-spirit"
npc_name = "Drowned Keeper"
custom_sprite_path = "res://assets/sprites/npcs/npc_guard.png"
dialogue_text = "The idol sleeps in the north alcove. The ghouls do not."

[node name="HeroPlayer" parent="." instance=ExtResource("3_hp")]
position = Vector2(300, 540)

[node name="GhoulLeader" parent="." instance=ExtResource("5_te")]
position = Vector2(1500, 540)
enemy_id = "ghoul_leader"
enemy_name = "Vault Ghoul"
max_hp = 30
armor_class = 12
attack_bonus = 4
damage_min = 3
damage_max = 8
sprite_texture_path = "res://assets/sprites/enemies/zombie.png"
friends = ["ghoul_lurker"]

[node name="GhoulLurker" parent="." instance=ExtResource("5_te")]
position = Vector2(1750, 300)
enemy_id = "ghoul_lurker"
enemy_name = "Vault Lurker"
max_hp = 18
armor_class = 13
sprite_texture_path = "res://assets/sprites/enemies/orc.png"
waypoints = [Vector2(1750, 300), Vector2(1750, 450)]

[node name="CanvasLayer" type="CanvasLayer" parent="."]

[node name="NoticeLabel" type="Label" parent="CanvasLayer"]
visible = false
offset_left = 340.0
offset_top = 40.0
offset_right = 940.0
offset_bottom = 80.0

[node name="PartyHUD" type="Panel" parent="CanvasLayer"]
script = ExtResource("9_hud")

[node name="QuestLabel" type="Label" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_left = 20.0
offset_top = 4.0
offset_right = 720.0
offset_bottom = 22.0
text = "Active Quest: Recover the Drowned Idol"

[node name="BtnOptions" type="Button" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_top = 10.0
offset_bottom = 46.0
text = "OPTIONS"

[node name="BtnInventory" type="Button" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_top = 10.0
offset_bottom = 46.0
text = "ITEMS"

[node name="BtnPause" type="Button" parent="CanvasLayer/PartyHUD"]
layout_mode = 0
offset_top = 10.0
offset_bottom = 46.0
text = "PAUSE"

[node name="ActionLog" parent="CanvasLayer" instance=ExtResource("10_al")]
offset_left = 20.0
offset_top = 780.0
offset_right = 780.0
offset_bottom = 1000.0

[node name="InventoryWindow" parent="CanvasLayer" instance=ExtResource("11_inv")]
visible = false

[node name="SettingsModal" parent="CanvasLayer" instance=ExtResource("12_sm")]
visible = false

[node name="CharacterStatusWindow" parent="CanvasLayer" instance=ExtResource("13_csw")]
visible = false
```

Notes on the tree:

- `Floor` has `mouse_filter = 2` (ignore). A `Control` that stops the mouse would swallow the click before `HeroPlayer._unhandled_input()` sees it, and click-to-move would stop working.
- The walls are shapes under one `StaticBody2D` on collision layer 1. `Pathfinder.gd` raycasts with mask 1, so these are the obstacles it routes around. Shapes under the body are fine; only gameplay nodes must be root children.
- `PartyHUD._ready()` anchors the panel to the bottom of the screen and sets the buttons' horizontal anchors and offsets, so only their vertical offsets (copied from `AncientCatacombs.tscn`) matter here. The buttons must be named `BtnOptions`, `BtnInventory` and `BtnPause`; the script finds them by name.
- `InventoryWindow`, `SettingsModal` and `CharacterStatusWindow` are found by name under `CanvasLayer` when the player presses the HUD buttons or **C**.
- `ActionLog` is required for NPC dialogue: `NPCCharacter.interact()` calls `ActionLog.start_dialogue()`. `VaultSpirit` has no dialogue tree in `dialogue.json`, so it uses the `dialogue_text` fallback.
- `FogOfWar` is optional and left out. If you add `scenes/components/FogOfWar.tscn`, set `map_width = 1920` and `map_height = 1080` and call `$FogOfWar.register_actor(node)` for each moving node, as `AncientCatacombs.gd` does.

### 4. Add the portal from the forest

Open `scenes/WhisperingForest.tscn`. It already loads `DoorPortal.tscn` as `ExtResource("6_dp")`. Add a node next to `CryptEntrance`:

New code — add to `scenes/WhisperingForest.tscn`:
```
[node name="SunkenVaultStairs" parent="." instance=ExtResource("6_dp")]
position = Vector2(620, 880)
door_id = "door-id-sunken-vault"
door_name = "Sunken Vault Stairs"
target_scene = "res://scenes/SunkenVault.tscn"
target_spawn = Vector2(300, 540)
```

(620, 880) is one of the forest's `get_nav_points()`, so the hero can path to it. The vault's `VaultExit` sends the party back to (620, 820), just north of these stairs.

How the hop works: clicking a door calls `DoorPortal.try_enter()`. It checks `is_locked` / `required_key` (both unused here), emits `door_entered`, stores `target_spawn` in `GameState.spawn_position`, and calls `change_scene_to_file(target_scene)`. `HeroPlayer._ready()` in the new scene moves the hero to `spawn_position` and resets it to `Vector2.ZERO`. To make the door locked, set `is_locked = true` and `required_key` to an item id; `opens_quest_stage` then advances the quest when it unlocks.

### 5. Try it by hand

Run the game (see [Quick start]({{ '/projects/crpg-realm/quick-start.html' | relative_url }})) and walk to the new stairs in the Whispering Forest. Or jump straight in through the HTTP control server, which listens on port 8080 by default (the next free port up to 8089 if taken):

```bash
curl -X POST http://127.0.0.1:8080/api/v1/setup_state -d '{"scene": "SunkenVault"}'
```

Check:

1. Clicking the floor walks the hero; nothing leaves the room.
2. **Find Traps** mode or the Find Traps spell shows the needle plate in red.
3. Clicking the idol adds "Drowned Idol" to the inventory log.
4. Clicking the spirit opens its line in the action log.
5. Walking toward the ghoul makes both ghouls chase you. Clicking a ghoul attacks it; clicking its corpse loots it.
6. The exit returns you next to the stairs in the forest, and the stairs bring you back.

---

## Verify it

Create `tests/e2e/features/normal/18_sunken_vault_dungeon.feature`. Every step phrase is defined in `tests/e2e/features/steps/crpg_steps.py` or `tests/e2e/features/steps/infinity_ai_steps.py`:

```gherkin
Feature: Sunken Vault dungeon
  As a level designer
  I want my new dungeon's trap, loot, enemies and portals wired correctly
  So that the scene follows the engine's flat-scene rules

  Background:
    Given the cRPG game is running and healthy

  Scenario: The vault loads and its trap can be found
    Given an isolated test starting in scene "SunkenVault" with party "Bramble" the "rogue"
    Then the current scene is "SunkenVault"
    And the scene contains concealed traps
    When the player enables Find Traps mode
    Then the trap "sunken-needle-trap" is detected and highlighted in red

  Scenario: Walking onto the needle plate springs it
    Given an isolated scenario starting in scene "SunkenVault"
    When the party member steps onto trap "sunken-needle-trap"
    Then the trap "sunken-needle-trap" is triggered
    And the party member suffers trap damage

  Scenario: The idol can be picked up
    Given an isolated scenario starting in scene "SunkenVault"
    When the infinity ai agent picks up item "item-id-vault-idol"
    Then the player inventory contains "item-id-vault-idol"

  Scenario: Approaching the ghoul pulls its linked ally
    Given an isolated scenario starting in scene "SunkenVault"
    Then all tactical enemies are on patrol with no targets
    When the player approaches within proximity distance of enemy "ghoul_leader"
    Then enemy "ghoul_leader" becomes aggravated with target "Lieutenant Vance"
    And close pack friend "ghoul_lurker" also aggros on "Lieutenant Vance"

  Scenario: Portals work in both directions
    Given an isolated scenario starting in scene "WhisperingForest"
    When the infinity ai agent enters door "door-id-sunken-vault"
    Then the current scene is "SunkenVault"
    When the infinity ai agent enters door "door-id-vault-exit"
    Then the current scene is "WhisperingForest"
```

Run it:
```bash
cd games/crpg-realm
python3 run_cucumber_tests.py tests/e2e/features/normal/18_sunken_vault_dungeon.feature
```
The report is written to `tests/e2e/reports/index.html` with one MP4 per scenario under `tests/e2e/reports/videos/`.

What each scenario relies on:

| Scenario | Mechanism |
|:--|:--|
| Loads / trap found | `setup_state` turns `"SunkenVault"` into `res://scenes/SunkenVault.tscn`. Detection rolls `max(10, d20)` + at least 4, so a DC 12 trap within 650 px is always found. |
| Needle plate | The `trigger_trap` action walks the hero onto the plate; `fail_save` forces full damage (2–8). |
| Idol | `pickup_item` finds the node by `item_id`, walks the hero next to it when it is more than 130 px away, and calls `GroundItem.pickup()`. |
| Ghouls | `battle.enemies` lists every root child with `loot_corpse()` and `enemy_id`. `approach_enemy` stops 220 px from the leader, inside its 280 px `aggro_radius`; the proximity rally reaches the linked lurker. |
| Portals | `enter_door` finds the node by `door_id`, walks to it and calls `try_enter()`. |

---

## Gotchas

- **Nesting breaks things quietly.** A trap under a group node is never detected and missing from `traps`; an enemy under one never hears pack alerts and is missing from `battle.enemies`; a companion under one is never targeted. The scene still loads and looks fine.
- **Forgetting `CombatManager`.** The `@onready` lookup of `$CombatManager` reports "Node not found" and leaves `combat_mgr` null, so the first enemy click errors. `Trap.gd` silently falls back to a detached `CombatManager.new()`.
- **Root name ≠ file name.** The scene loads, but `the current scene is "SunkenVault"` fails because the API reports the root node's name.
- **Traps on walking lines.** Any `CharacterBody2D` whose node name does not contain "ghost" or "npc" springs a trap by walking over it, including patrolling enemies and the hero on the way to something else. Keep traps off the routes your tests use.
- **`target_spawn` of (0, 0) means "don't move".** `DoorPortal` only sets `spawn_position` when `target_spawn != Vector2.ZERO`, so the hero appears at its position in the `.tscn`.
- **JSON wins over exports for traps.** Once `trap_id` matches `traps.json`, changing `detect_dc` in the Inspector does nothing.
- **`monsters.json` does not drive enemies.** Set HP, AC and damage on each `TacticalEnemy` instance.
- **Do not regenerate `DataStoreV1.gd`** with `packages/crpg-builder`. Its template lacks races, traps and mod loading and would overwrite the hand-edited file.
- **`tests/validate_schemas.py` does not validate against the schemas.** It checks that its listed data files parse and spot-checks a few records. `traps.json` is not in its list; use `python3 -m json.tool`.

---

[← Previous: 11. Spells, AoE and magic]({{ '/projects/crpg-realm/create-your-own-game/11-spells-aoe-and-magic-systems.html' | relative_url }}) · [Back to the guide index →]({{ '/projects/crpg-realm/create-your-own-game.html' | relative_url }})
