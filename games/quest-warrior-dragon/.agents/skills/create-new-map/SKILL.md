---
name: create-new-map
description: Core steps for creating standalone overworld or town map scenes, configuring viewport sizing, spawn positions, and scene transitions.
---

# 🗺️ Create a New Map Scene Skill

Use this skill when building new standalone town or overworld map scenes.

## 🏗️ Architecture Summary

Every map scene consists of:
1. Rendered background (tile grid or composite PNG image)
2. Tile-aligned hero movement & collision
3. Music playback
4. Triggers (stairs, doors, map borders, castle entry points)

---

## 📋 Steps to Create a Map

### 1. Asset Placement
- Place PNG map image at `assets/maps/<map-name>.png`.
- For grid-based scenes, use `assets/sprites/rgba/tiles.png`.

### 2. Script Blueprint
Set viewport and grid constants:

```gdscript
const TILE_SIZE := 16
const MAP_PX    := 1984
const MAP_TILES := 124
const VW        := 256
const VH        := 240

@export var spawn_tile   : Vector2i = Vector2i(10, 10)
@export var spawn_facing : String   = "down"
```

### 3. Scene Entry & Transition Wiring
In `_ready()`:
```gdscript
var gs := get_node_or_null("/root/GameState")
if gs and gs.come_from != "":
    _hero_tile   = gs.spawn_tile
    _hero_facing = _facing_to_vec(gs.spawn_facing)
```

Triggering scene change:
```gdscript
_save_state(Vector2i(DEST_X, DEST_Y), "this_scene_id")
get_tree().change_scene_to_file.call_deferred("res://scenes/TargetScene.tscn")
```

### 4. Create Scene File (`scenes/<MyMap>.tscn`)
```tscn
[gd_scene load_steps=2 format=3 uid="uid://unique_id_here"]
[ext_resource type="Script" path="res://scripts/MyMap.gd" id="1_script"]
[node name="MyMap" type="Node2D"]
script = ExtResource("1_script")
```
