---
name: sprite-and-character-setup
description: Instructions for referencing NPC character sprite sheets, adding character frames to NPCCharacterData, and handling walk animations.
---

# 🚶 Sprite & Character Setup Skill

Use this skill when configuring NPC character sprites, adding walk-cycle frames, or mapping sprite IDs.

## 🖼️ NPC Character Lookup (`scripts/NPCCharacterData.gd`)

`NPCCharacterData` maps sprite keys to 8 directional walk-cycle frames pre-sliced under `res://assets/sprites/npc/NNN_rROW_cCOL.png`:

```gdscript
const CHARACTERS := {
  "sage": {
    "display": "Sage",
    "row": 2, "col": 8,
    "down":  ["038_r2_c8.png",  "039_r2_c9.png"],
    "left":  ["040_r2_c10.png", "041_r2_c11.png"],
    "up":    ["042_r2_c12.png", "043_r2_c13.png"],
    "right": ["044_r2_c14.png", "044_r2_c14.png"],
  },
  ...
}
```

If a character's sheet cell is missing frame 2 (e.g., at the sheet boundary), both directional entries point to the same frame file.

---

## 🎨 Steps to Add a New Character Sprite

1. Slice 8 frames from source image into `assets/sprites/npc/` following `NNN_rROW_cCOL.png` naming (increment `NNN` sequentially).
2. Add entry to `NPCCharacterData.CHARACTERS` with a unique string key (`sprite_id`).
3. Re-import assets: `godot --import --quit --path .`

---

## ⚙️ Runtime Sprite Classes

- **`scripts/WalkSprite.gd`**: Generic 4-direction walk-cycle sprite used for hero and NPCs.
- **`scripts/NPCSprite.gd`**: Wraps `WalkSprite` for static and roaming map NPCs.
- **`scripts/NPCSpriteFiles.gd`**: Helper for resolving sprite frames to `Texture2D` resources.
- **`data/v1/sprite_frames.json`**: Documents monster battle sprite frame layouts.
