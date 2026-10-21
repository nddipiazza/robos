---
name: create-new-dungeon-floor
description: Step-by-step workflow for extending DungeonMap.gd, building PNG layout masks, configuring stair transitions, and adding dungeon scenes.
---

# 🏰 Create a New Dungeon Floor Skill

Use this skill when building new indoor dungeon floors (e.g. Garinham B1–B4, Mountain Cave, Charlock Castle).

## 🏗️ Overview

Newer dungeon scenes extend `DungeonMap.gd` (`extends "res://scripts/DungeonMap.gd"`). A minimal dungeon script requires ~20 lines:

```gdscript
extends "res://scripts/DungeonMap.gd"

const MAP_W := 22
const MAP_H := 22

func _map_image_path() -> String:
    return "res://assets/maps/garinham-b1.png"

func _get_map_w() -> int:
    return MAP_W

func _get_map_h() -> int:
    return MAP_H

func _get_music_path() -> String:
    return "res://assets/music/mp3/dungeon_1.mp3"

func _check_transitions() -> void:
    pass
```

---

## 📋 Steps

### 1. Map Image
Save the dungeon layout PNG at `assets/maps/<map-name>.png`. `DungeonMap._load_tile_grid()` samples this image directly to infer walkable floor vs unwalkable walls.

### 2. Override Required Base Methods
- `_map_image_path() -> String`
- `_get_map_w() -> int` / `_get_map_h() -> int`
- `_get_music_path() -> String`
- `_get_npcs() -> Array` (optional)
- `_check_transitions() -> void` (edge/border checks)

### 3. Stair Registrations (`data/v1/stair_registry.json`)
Register stair linkages:

```json
"garinham-b1": [
  { "id": "garb1-to-1f-a", "tile": {"col": 5, "row": 2}, "to": "garinham1f-from-b1-a", "facing": "down" }
]
```

Add the mapping between scene name and map key in `_scenes` block of `stair_registry.json`.

### 4. Create Scene File (`scenes/<Name>.tscn`)
Instantiate a Node2D pointing at the new script and register debug presets in `tools/debug-launcher/renderer/app.js`.
