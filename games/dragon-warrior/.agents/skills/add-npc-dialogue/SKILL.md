---
name: add-npc-dialogue
description: Instructions for placing NPCs, assigning sprite IDs, and formatting dialogue pages across Castle1F-style and DungeonMap-style maps.
---

# 💬 Add an NPC with Dialogue Skill

Use this skill when adding non-player characters (NPCs) and dialogue to towns, castles, or dungeon levels.

## 🏗️ Implementation Patterns

### Pattern A — Castle1F-style Scenes (Standalone scripts like `Castle1F.gd`, `ThroneRoom.gd`)

1. Add NPC tile ID to `NPC_IDS` if creating a new tile sprite in the map image.
2. Override character sprite in `NPC_CHAR_OVERRIDE` (keyed by `"col,row"`) using an ID from `NPCCharacterData.CHARACTERS`.
3. Set initial facing direction in `NPC_FACING` if not `"down"`.
4. Add dialogue text pages in `NPC_DIALOGS`:
   ```gdscript
   "12,7": {
       "speaker": "Guard",
       "pages": [
           "Welcome to Tantegel Castle.",
           "The King awaits thee."
       ],
   },
   ```
5. Maintain consistency with `data/v1/dialogue.json` for reference tracking.

### Pattern B — DungeonMap-based Scenes (`extends "res://scripts/DungeonMap.gd"`)

Override `_get_npcs() -> Array` to return NPC descriptors:

```gdscript
func _get_npcs() -> Array:
    return [
        {
            "tile": Vector2i(13, 2),
            "sprite_id": "sage",
            "facing": "down",
            "speaker": "Sage",
            "pages": ["Only those who possess\nthe Rainbow Drop may enter\nCharlock Castle."],
        },
    ]
```

`DungeonMap._build_npcs()` handles instantiation and `_cmd_talk()` handles front-facing tile interaction. For shops or inns, supply `shop_id` or `inn_cost` keys instead of `pages`.

---

## 📌 Reference Data

- `data/v1/npcs.json` specifies canonical NES NPC coordinates and roles (`role: "sage"`, `desk_tile` for shopkeepers).
- Character sprite IDs (`sage`, `merchant`, `red_guard`, etc.) are defined in `NPCCharacterData.CHARACTERS` (`scripts/NPCCharacterData.gd`).
