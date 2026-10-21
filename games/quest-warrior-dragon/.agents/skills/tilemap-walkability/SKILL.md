---
name: tilemap-walkability
description: Reference and instructions for tilemap walkability systems, including small-map grid arrays and overworld color-sampled terrain masks.
---

# 🧱 Tilemap & Walkability Skill

Use this skill when implementing map terrain collision, defining tile passability, or generating terrain masks.

## 📐 Approach A — Hand-Coded `MAP_GRID` Array (Indoor Maps ≤ 32×32)

Used by small maps (e.g. `Castle1F`, `ThroneRoom`). Map tiles are stored in a 2D `MAP_GRID` array with a `WALKABLE` dictionary:

```gdscript
const MAP_GRID := [
    [0, 0, 0, 0],
    [0, 1, 3, 3],
]

const WALKABLE := { 3: true, 4: true, 21: true, 30: true, 31: true, 33: true, 34: true }

func _is_walkable(pos: Vector2i) -> bool:
    if pos.x < 0 or pos.y < 0 or pos.x >= MAP_W or pos.y >= MAP_H:
        return false
    return WALKABLE.has(MAP_GRID[pos.y][pos.x])
```

---

## 🎨 Approach B — Color-Sampled Terrain Mask (WorldMap 124×124)

`dw1-over2.png` (1984×1984 px, 16px per tile = 124×124 tiles) serves as the primary overworld texture. Terrain types are classified by sampling center pixel colors.

### Regenerating Terrain Mask

Run the terrain generator python script when overworld textures change:

```bash
python3 tools/gen_worldmap_terrain.py
# Writes: assets/maps/worldmap_terrain.png and assets/maps/worldmap_terrain.json
```

---

## 💡 Choosing the Right Strategy

- **Indoor / Small Maps (≤ 32×32)**: Use Approach A (`MAP_GRID` array or DungeonMap pixel floor sampling).
- **Overworld / Large Maps**: Use Approach B (color sampling + JSON terrain mask).
