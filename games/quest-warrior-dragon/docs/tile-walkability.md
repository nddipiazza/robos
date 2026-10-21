# Tile Walkability — Developer Guide

## Overview

Every map in Quest: Warrior Dragon is a 2D grid of **tile IDs**. Whether the player can step on a tile is determined by a small allowlist in the map script called `WALKABLE`. If a tile's ID is not in that dict, it is impassable — no exceptions.

---

## How It Works

### 1. The MAP_GRID

Each map scene stores its layout as a 2D array constant:

```gdscript
const MAP_GRID := [
    [90, 90, 90, ...],   # row 0
    [90,  1,  3, ...],   # row 1
    ...
]
```

`MAP_GRID[row][col]` gives the **tile ID** at that grid position (col = X, row = Y).

### 2. The WALKABLE Allowlist

```gdscript
const WALKABLE := { 3: true, 30: true }
```

Only tile IDs listed here are passable. Everything else is a wall/obstacle by default.

### 3. The `_is_walkable()` Check

```gdscript
func _is_walkable(col: int, row: int) -> bool:
    if row < 0 or row >= MAP_GRID.size():      return false
    if col < 0 or col >= MAP_GRID[row].size(): return false
    var tile: int = MAP_GRID[row][col]
    if tile == 10: return _door_unlocked        # special: locked door
    if not WALKABLE.has(tile): return false
    if Vector2i(col, row) in NPC_TILES: return false
    return true
```

Three things can block a tile even if it looks like floor:
1. **Not in WALKABLE** — the tile ID is simply not in the allowlist
2. **Special logic** — e.g. tile 10 (door) requires `_door_unlocked == true`
3. **NPC blocker** — an NPC is standing there (`NPC_TILES` array)

---

## Throne Room Tile Reference

See `docs/tile_reference.png` for a visual. Here is the full table for `tantegel-castle-2f`:

| Tile ID | Visual | Name | Walkable? | Notes |
|---------|--------|------|-----------|-------|
| 1 | Brick wall | Wall | ❌ No | Outer/inner walls |
| 3 | Stone floor | Floor | ✅ Yes | Standard walkable floor |
| 8 | Table/bench | Furniture | ❌ No | Throne room tables, benches |
| 10 | Archway door | Door | 🔒 Locked | Requires `unlock_door()` call |
| 26 | Guard (baked) | Guard spawn | ❌ No | Guard tile — replaced with floor in bg render; NPC placed on top |
| 30 | Treasure chest | Chest | ✅ Yes | Player walks on it to examine |
| 33 | Stairs down | Stairs | ❌ No | Not yet implemented |
| 73 | Guard (baked) | Guard spawn | ❌ No | Same as 26 |
| 90 | Stone wall | Outer wall | ❌ No | Border / void |
| 91 | Throne | Throne | ❌ No | King Lorik sits here |

---

## How to Diagnose a Wrong Walkability

### Step 1 — Find the tile ID at the problem position

Look up the `MAP_GRID` coordinates. Example: player can walk onto the throne area tables (row 3, cols 3–8):

```
Row 3: [90, 1, 3, 8, 8, 8, 8, 8, 8, 3, 1, 90]
              ↑ walkable floor    ↑ tile 8
```

Tile 8 was mistakenly in `WALKABLE` — it looks like a table, not a floor.

### Step 2 — Check the tile visually

Open `docs/tile_reference.png`. Find the tile ID. If it looks like furniture, a wall, or a decorative object → it should **not** be in `WALKABLE`.

### Step 3 — Edit the WALKABLE dict

```gdscript
# ❌ Wrong — tile 8 (table) was walkable
const WALKABLE := { 3: true, 8: true, 30: true }

# ✅ Fixed — only floor (3) and chests (30)
const WALKABLE := { 3: true, 30: true }
```

### Step 4 — Verify with the reference image

The general rule from the NES original:

| Should be walkable | Should be blocked |
|--------------------|-------------------|
| Stone floor (3) | Any wall tile |
| Treasure chest (30) | Furniture / tables (8) |
| Stairs (when implemented) | Throne (91) |
| Door (10, when unlocked) | Locked door (10, default) |

---

## Adding a New Map

When building a new scene:

1. Dump the tile grid from `data/map_grids.json` into `MAP_GRID`
2. Start with only `{ 3: true }` in `WALKABLE`
3. Play-test and use `docs/tile_reference.png` (or generate a new one) to identify each tile ID
4. Add IDs to `WALKABLE` only after visually confirming they are floor-type tiles
5. Add any special-cased tiles (doors, switches) with their own logic in `_is_walkable()`

---

## Regenerating the Tile Reference Image

```bash
cd ~/source/quest-warrior-dragon
python3 - <<'EOF'
# (copy the generation script from scripts/gen_tile_reference.py)
EOF
```

The script crops one sample of each unique tile ID from the map source image, scales to 64px, and labels each with its ID. Output: `docs/tile_reference.png`.

---

## Command Menu (B Button)

Press **B** during free movement to open the 8-command menu. Navigate with arrow keys, confirm with **Enter/Space**, cancel with **B or Escape**.

```
┌─────────────────────────┐
│ COMMAND                 │
│─────────────────────────│
│ ► TALK    DOOR          │
│   STATUS  TAKE          │
│   STAIRS  SPELL         │
│   SEARCH  ITEM          │
└─────────────────────────┘
```

| Command | Tile check | Behavior |
|---------|-----------|---------|
| TALK    | Facing tile → NPC_DIALOGS key lookup | Starts NPC dialog |
| STATUS  | — | Shows hero stats overlay |
| STAIRS  | Current tile == 33 | Descends stairs |
| SEARCH  | Current tile == 30 | Finds chest item |
| DOOR    | Facing tile == 10 | Opens locked door (needs Magic Key) |
| TAKE    | Facing tile == 30 | Picks up chest |
| SPELL   | — | Stub (no spells yet) |
| ITEM    | — | Stub (inventory empty) |

NPC data is stored in `NPC_DIALOGS` const, keyed by `col*100+row`.
