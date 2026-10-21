---
name: add-treasure-chest
description: Reference and instructions for implementing treasure chest interactions, persistence, loot distribution, and visual tile updates.
---

# 📦 Add a Treasure Chest Skill

Use this skill when placing treasure chests, granting items/gold, and persisting opened state across scenes.

## 📌 Architecture & Reference Implementation

`data/v1/chest_registry.json` (tile locations per map and loot definitions) provides canonical data. `Castle1F.gd` serves as the working reference implementation.

Chests use tile ID `30` on map images.

### State Persistence

Opened chests are tracked in a dictionary keyed by map and tile coordinates (`"<map_id>:<col>,<row>"`), synced with `GameState.opened_chests`:

```gdscript
var _opened_chests: Dictionary = {}
```

### Search & Take Commands

```gdscript
func _cmd_search() -> void:
    if _map_tile_at(_hero_tile) == 30:
        _show_dialog("", ["Thou dost find a Treasure\nChest beneath thy feet!"])

func _cmd_take() -> void:
    if _map_tile_at(_hero_tile) != 30:
        _show_dialog("", ["There is nothing\nto take here."])
        return
    var key := str(_hero_tile.x) + "," + str(_hero_tile.y)
    if _opened_chests.has(key):
        _show_dialog("", ["The chest is already\nempty."])
        return
    var gold_amount := 10 + randi() % 50
    _hero_gold += gold_amount
    _opened_chests[key] = true
    _play_sfx("res://assets/music/mp3/open_treasure.mp3")
    _open_chest_visual(_hero_tile)
    _show_dialog("", ["Thou dost find\n" + str(gold_amount) + " Gold Pieces!"])
```

`_open_chest_visual()` redraws a floor tile over tile ID `30`.

---

## 🎁 Unique Items vs Gold

To award key items or tools instead of random gold, match coordinate keys against `data/treasures.json`:

```gdscript
if key == "11,5":
    _inventory.append({"name": "Torch", "type": "tool", "desc": "A torch can be used only in dark places."})
    _show_dialog("", ["Thou hast found a Torch!"])
```
