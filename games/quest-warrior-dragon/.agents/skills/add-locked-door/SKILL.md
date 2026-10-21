---
name: add-locked-door
description: Instructions and reference patterns for adding locked doors, consuming Magic Keys, and wiring door interactions.
---

# 🔑 Add a Locked Door Skill

Use this skill when placing or handling locked doors across map scenes and dungeon scripts.

## 📌 Current State & Architecture

`data/v1/door_registry.json` has canonical door tile coordinates per map. `Castle1F.gd` has a working reference implementation; `DungeonMap.gd`'s `_cmd_door()` is a base-class stub that can be overridden or extended.

---

## 🛠️ Reference Implementation (`scripts/Castle1F.gd`)

Doors use tile ID `10` on the map image. Opening one requires a `"key"`-typed item in inventory:

```gdscript
func _cmd_door() -> void:
    var ft := _facing_tile()
    if _map_tile_at(ft) == 10:
        var has_key := false
        for item in _inventory:
            if item.get("type", "") == "key":
                has_key = true
                break
        if has_key:
            for i in _inventory.size():
                if _inventory[i].get("type", "") == "key":
                    _inventory.remove_at(i)   # keys are consumed on use
                    break
            _play_sfx("res://assets/music/mp3/open_door.mp3")
            _show_dialog("", ["The door clicks open."], func(): _open_door_visual(ft))
        else:
            _show_dialog("", ["Thou dost not have\na Magic Key."])
    else:
        _show_dialog("", ["There is no door\nin that direction."])
```

Using a key item directly from the ITEM menu does the same thing (`_use_item()` matches `item.get("type", "") == "key"` and checks the facing tile). `_open_door_visual()` blits a floor tile over the door sprite.

Magic Keys are single-use and consumed per door (matching NES behavior).

---

## 📍 Cross-Referencing Door Locations

`data/v1/door_registry.json` specifies `col`/`row`/`id` per map key (e.g. `"cantlin-1f": [{"col": 27, "row": 10, "id": "ctnd1"}, ...]`). Use these coordinates when placing doors in scene images and scripts.

---

## 🚪 Adding Doors to a DungeonMap-based Scene

Port the `_cmd_door()` / `_use_item()` pattern into the specific dungeon script by overriding `_cmd_door()`, or implement it directly in `DungeonMap.gd` so all dungeons inherit locked-door handling automatically.
