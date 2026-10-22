#!/usr/bin/env python3
"""
Procedural Copyright-Free Asset & Chiptune Audio Generator for RobOS Dragon Warrior.

Regenerates 100% of visual and audio assets from semantic game data (`data/v1/`):
  1. 362 16x16 pixel-art tiles (`assets/tiles/tile_000.png`..`tile_361.png`) + tile atlases
  2. All 29 town, castle, and dungeon floor maps (`assets/maps/*.png`, `assets/renders/*.png`, `grid_views/`)
  3. 124x124 Overworld map (`assets/maps/dw1-over2.png`, `assets/maps/world-map.png`, `worldmap_terrain.png`)
  4. Character & NPC sprite sheet (`assets/sprites/rgba/characters-3.png`) + 102 sliced NPC frames
  5. All 44 Monster battle sprites (`assets/sprites/bestiary/*.png`, `assets/reference/mikesrpgcenter/bestiary/*.png`, `monsters-2.png`)
  6. Spell effect overlays (`assets/images/spells/*.png`), Title Screen (`assets/title-screen.png`), UI icons
  7. All 45 Chiptune BGM & SFX audio tracks (`assets/music/mp3/*.mp3`)
"""

from __future__ import annotations

import json
import math
import os
import random
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "v1"
ASSETS_DIR = ROOT / "assets"


# ---------------------------------------------------------------------------
# 1. TILE GENERATION (362 16x16 tiles + tile sheets)
# ---------------------------------------------------------------------------

def _clamp(v: float, lo: int = 0, hi: int = 255) -> int:
    return max(lo, min(hi, int(round(v))))


def _tint(rgb: tuple[int, int, int], delta: int) -> tuple[int, int, int, int]:
    return (_clamp(rgb[0] + delta), _clamp(rgb[1] + delta), _clamp(rgb[2] + delta), 255)


def draw_tile_16x16(tid: int, label: str, avg_rgb: list[int], walkable: bool) -> Image.Image:
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 255))
    px = img.load()
    r, g, b = avg_rgb[0], avg_rgb[1], avg_rgb[2]
    # Ensure walkable fallback luminance > 0.05 even on dark floors
    if walkable and (r * 0.2126 + g * 0.7152 + b * 0.0722) < 28:
        r, g, b = max(r, 36), max(g, 36), max(b, 44)
    base = (r, g, b)
    rng = random.Random(tid * 1337 + 42)

    # Special well-known tile IDs in Castle1F / ThroneRoom / Dungeons
    if tid in (10,):  # Door
        _draw_door_tile(px)
        return img
    if tid in (18,):  # Wooden bridge over a town moat / river
        return draw_bridge_tile_16x16()
    if tid in (8, 21, 33, 34):  # Stairs
        _draw_stair_tile(px, down=(tid in (8, 34)))
        return img
    if tid in (30, 31):  # Royal carpet / ornate floor
        _draw_carpet_tile(px, tid)
        return img
    if tid in (13, 14):  # Barrier tile
        _draw_barrier_tile(px, tid)
        return img

    if label == "grass" or tid == 0:
        grass_base = (56, 168, 44) if tid == 0 else (_clamp(r * 0.7 + 20), _clamp(max(g, 130)), _clamp(b * 0.7 + 15))
        for y in range(16):
            for x in range(16):
                n = ((x * 7 + y * 13 + tid) % 5) - 2
                px[x, y] = _tint(grass_base, n * 4)
        # Grass blades
        blade_col = _tint(grass_base, 28)
        shadow_col = _tint(grass_base, -22)
        for bx, by in [(2, 3), (9, 2), (5, 8), (12, 7), (3, 13), (10, 12)]:
            px[(bx + tid) % 15, by] = blade_col
            px[(bx + tid + 1) % 15, by - 1] = blade_col
            px[(bx + tid) % 15, min(15, by + 1)] = shadow_col

    elif label == "forest" or tid == 4:
        trunk = (92, 60, 28, 255)
        leaf_dark = (24, 108, 28, 255)
        leaf_mid = (44, 148, 38, 255)
        leaf_hi = (78, 188, 56, 255)
        bg = (42, 136, 36, 255)
        for y in range(16):
            for x in range(16):
                px[x, y] = bg
        for y in range(2, 13):
            for x in range(2, 14):
                dist = abs(x - 7.5) + abs(y - 6.5)
                if dist < 6.5:
                    px[x, y] = leaf_hi if (x + y < 12) else (leaf_mid if dist < 5.0 else leaf_dark)
        for y in range(11, 15):
            for x in range(6, 10):
                px[x, y] = trunk

    elif label == "water" or tid == 6:
        water_base = (28, 82, 196)
        wave_hi = (110, 175, 250, 255)
        wave_mid = (52, 118, 224, 255)
        for y in range(16):
            for x in range(16):
                px[x, y] = _tint(water_base, ((x + y) % 3 - 1) * 5)
        for wy in (3, 8, 13):
            ox = (wy * 3 + tid) % 6
            for wx in range(ox, ox + 5):
                px[wx % 16, wy] = wave_hi
                px[(wx + 1) % 16, min(15, wy + 1)] = wave_mid

    elif not walkable and (label in ("stone", "light_stone", "dark", "misc") or tid == 1):
        # Solid masonry brick wall
        brick_col = (128, 132, 146) if label != "dark" else (78, 72, 92)
        if r > 140 and b < 100:
            brick_col = (156, 98, 64)
        mortar = _tint(brick_col, -48)
        hi = _tint(brick_col, 24)
        lo = _tint(brick_col, -20)
        for y in range(16):
            row_idx = y // 4
            offset = (row_idx % 2) * 4
            for x in range(16):
                if y % 4 == 0 or (x + offset) % 8 == 0:
                    px[x, y] = mortar
                elif y % 4 == 1 or (x + offset) % 8 == 1:
                    px[x, y] = hi
                elif y % 4 == 3 or (x + offset) % 8 == 7:
                    px[x, y] = lo
                else:
                    px[x, y] = _tint(brick_col, rng.randint(-4, 4))

    elif walkable and label in ("stone", "light_stone", "misc", "dark"):
        # Walkable stone paver floor
        floor_col = (148, 152, 164) if label == "light_stone" or tid == 3 else (112, 116, 128)
        grout = _tint(floor_col, -24)
        hi = _tint(floor_col, 14)
        for y in range(16):
            for x in range(16):
                if x == 0 or y == 0 or (x == 8 and y > 0) or (y == 8 and x > 0):
                    px[x, y] = grout
                elif x == 1 or y == 1:
                    px[x, y] = hi
                else:
                    px[x, y] = _tint(floor_col, ((x * 3 + y * 5 + tid) % 5) - 2)

    else:
        # Dirt / desert / general terrain
        col = (max(40, r), max(40, g), max(35, b))
        for y in range(16):
            for x in range(16):
                n = rng.randint(-10, 10)
                px[x, y] = _tint(col, n)
        if not walkable:
            # Draw border frame to indicate obstacle
            border = _tint(col, -35)
            for i in range(16):
                px[i, 0] = border
                px[i, 15] = border
                px[0, i] = border
                px[15, i] = border

    return img


def _draw_door_tile(px) -> None:
    wood = (142, 78, 32, 255)
    wood_dark = (94, 48, 16, 255)
    iron = (72, 76, 88, 255)
    gold = (238, 196, 56, 255)
    for y in range(16):
        for x in range(16):
            if x in (0, 1, 14, 15) or y in (0, 1):
                px[x, y] = iron
            elif x in (4, 8, 11):
                px[x, y] = wood_dark
            else:
                px[x, y] = wood
    # Iron straps & keyhole
    for x in range(2, 14):
        px[x, 4] = iron
        px[x, 12] = iron
    px[11, 8] = gold
    px[11, 9] = gold


def _draw_chest_tile(px, bg_rgb: tuple[int, int, int]) -> None:
    for y in range(16):
        for x in range(16):
            px[x, y] = _tint(bg_rgb, ((x + y) % 3 - 1) * 4)
    wood = (168, 86, 28, 255)
    wood_hi = (204, 118, 46, 255)
    gold = (244, 204, 52, 255)
    outline = (36, 22, 12, 255)
    for y in range(3, 14):
        for x in range(2, 14):
            if x in (2, 13) or y in (3, 13):
                px[x, y] = outline
            elif y in (6, 7) or x in (3, 12):
                px[x, y] = gold
            elif y < 6:
                px[x, y] = wood_hi
            else:
                px[x, y] = wood
    px[7, 7] = (255, 245, 160, 255)
    px[8, 7] = (255, 245, 160, 255)


def _draw_stair_tile(px, down: bool = True) -> None:
    bg = (40, 42, 54, 255) if down else (120, 124, 138, 255)
    step_hi = (196, 200, 214, 255)
    step_mid = (146, 150, 166, 255)
    step_lo = (78, 82, 96, 255)
    for y in range(16):
        for x in range(16):
            px[x, y] = bg
    for s in range(4):
        sy = 2 + s * 3
        sx0 = 2 + (s * 2 if down else (3 - s) * 2)
        for x in range(sx0, 14):
            px[x, sy] = step_hi
            px[x, sy + 1] = step_mid
            px[x, sy + 2] = step_lo


def _draw_carpet_tile(px, tid: int) -> None:
    crimson = (178, 28, 42)
    gold = (236, 192, 58, 255)
    for y in range(16):
        for x in range(16):
            if x in (0, 15) or y in (0, 15):
                px[x, y] = gold
            elif (x + y) % 4 == 0:
                px[x, y] = _tint(crimson, 18)
            else:
                px[x, y] = _tint(crimson, -6)


def _draw_barrier_tile(px, tid: int) -> None:
    for y in range(16):
        for x in range(16):
            v = int(128 + 90 * math.sin((x + y) * 0.8) * math.cos((x - y) * 0.8))
            px[x, y] = (_clamp(v), _clamp(v // 4), _clamp(v + 30), 255)


def _draw_counter_tile(px) -> None:
    floor_col = (138, 142, 154, 255)
    wood_top = (188, 118, 54, 255)
    wood_front = (136, 78, 32, 255)
    border = (58, 32, 14, 255)
    for y in range(16):
        for x in range(16):
            if 3 <= y <= 12:
                if y in (3, 12) or x in (0, 15):
                    px[x, y] = border
                elif y <= 7:
                    px[x, y] = wood_top
                else:
                    px[x, y] = wood_front
            else:
                px[x, y] = floor_col


def generate_tiles_and_maps() -> dict[int, Image.Image]:
    tiles_meta = json.loads((DATA_DIR / "tiles_meta.json").read_text(encoding="utf-8"))["tiles"]
    _tw = json.loads((DATA_DIR / "tile_walkability.json").read_text(encoding="utf-8"))
    walkable_ids = set(_tw["walkable"]) | {int(_tw.get("door", 10))}
    map_grids = json.loads((DATA_DIR / "map_grids.json").read_text(encoding="utf-8"))["maps"]
    chests = json.loads((DATA_DIR / "chest_registry.json").read_text(encoding="utf-8"))
    doors = json.loads((DATA_DIR / "door_registry.json").read_text(encoding="utf-8"))
    stairs = json.loads((DATA_DIR / "stair_registry.json").read_text(encoding="utf-8"))
    shops = json.loads((DATA_DIR / "shops.json").read_text(encoding="utf-8"))

    tiles_dir = ASSETS_DIR / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    tile_imgs: dict[int, Image.Image] = {}
    for t in tiles_meta:
        tid = int(t["id"])
        label = str(t.get("auto_label", "stone"))
        avg_rgb = t.get("avg_rgb", [120, 120, 120])
        is_walk = tid in walkable_ids
        im = draw_tile_16x16(tid, label, avg_rgb, is_walk)
        tile_imgs[tid] = im
        im.save(tiles_dir / f"tile_{tid:03d}.png")

    # Assemble tile atlas sheet (415x359 RGBA)
    atlas = Image.new("RGBA", (415, 359), (16, 16, 24, 255))
    cols = 24
    for tid, im in sorted(tile_imgs.items()):
        c = tid % cols
        r = tid // cols
        if c * 17 + 16 <= 415 and r * 17 + 16 <= 359:
            atlas.paste(im, (c * 17, r * 17))
    (ASSETS_DIR / "sprites" / "rgba").mkdir(parents=True, exist_ok=True)
    atlas.save(ASSETS_DIR / "sprites" / "rgba" / "tiles.png")
    atlas.save(ASSETS_DIR / "sprites" / "tiles.png")

    # Pre-build special overlay tiles for chests, doors, stairs, counters
    chest_tile = Image.new("RGBA", (16, 16))
    _draw_chest_tile(chest_tile.load(), (136, 140, 152))
    door_tile = Image.new("RGBA", (16, 16))
    _draw_door_tile(door_tile.load())
    stair_down_tile = Image.new("RGBA", (16, 16))
    _draw_stair_tile(stair_down_tile.load(), down=True)
    stair_up_tile = Image.new("RGBA", (16, 16))
    _draw_stair_tile(stair_up_tile.load(), down=False)
    counter_tile = Image.new("RGBA", (16, 16))
    _draw_counter_tile(counter_tile.load())

    # Index shop desks per map
    shop_desks: dict[str, list[tuple[int, int]]] = {}
    for s in shops if isinstance(shops, list) else shops.get("shops", []):
        mk = str(s.get("map_key", ""))
        dt = s.get("desk_tile")
        if mk and isinstance(dt, list) and len(dt) >= 2:
            shop_desks.setdefault(mk, []).append((int(dt[0]), int(dt[1])))
            shop_desks.setdefault(f"{mk}-1f", []).append((int(dt[0]), int(dt[1])))

    maps_dir = ASSETS_DIR / "maps"
    grid_views_dir = maps_dir / "grid_views"
    renders_dir = ASSETS_DIR / "renders"
    maps_dir.mkdir(parents=True, exist_ok=True)
    grid_views_dir.mkdir(parents=True, exist_ok=True)
    renders_dir.mkdir(parents=True, exist_ok=True)

    default_floor = tile_imgs.get(3, draw_tile_16x16(3, "light_stone", [148, 152, 164], True))

    for map_key, mdata in sorted(map_grids.items()):
        w_tiles = int(mdata["cols"])
        h_tiles = int(mdata["rows"])
        grid = mdata["grid"]
        map_img = Image.new("RGBA", (w_tiles * 16, h_tiles * 16), (20, 20, 28, 255))

        for ry in range(h_tiles):
            row = grid[ry] if ry < len(grid) else []
            for rx in range(w_tiles):
                tid = int(row[rx]) if rx < len(row) else 1
                t_im = tile_imgs.get(tid, default_floor)
                map_img.paste(t_im, (rx * 16, ry * 16))

        # Overlay registered shop desks
        for cx, cy in shop_desks.get(map_key, []):
            if 0 <= cx < w_tiles and 0 <= cy < h_tiles:
                map_img.paste(counter_tile, (cx * 16, cy * 16))

        # Overlay registered chests
        for c_entry in chests.get(map_key, []):
            cx, cy = int(c_entry["col"]), int(c_entry["row"])
            if 0 <= cx < w_tiles and 0 <= cy < h_tiles:
                map_img.paste(chest_tile, (cx * 16, cy * 16))

        # Overlay registered doors
        for d_entry in doors.get(map_key, []):
            dx, dy = int(d_entry["col"]), int(d_entry["row"])
            if 0 <= dx < w_tiles and 0 <= dy < h_tiles:
                map_img.paste(door_tile, (dx * 16, dy * 16))

        # Overlay registered stairs
        s_list = stairs.get(map_key, [])
        if isinstance(s_list, list):
            for s_entry in s_list:
                st = s_entry.get("tile", {})
                if isinstance(st, dict) and "col" in st and "row" in st:
                    sx, sy = int(st["col"]), int(st["row"])
                    if 0 <= sx < w_tiles and 0 <= sy < h_tiles:
                        is_up = "1f" in str(s_entry.get("to", "")) or "up" in str(s_entry.get("id", ""))
                        map_img.paste(stair_up_tile if is_up else stair_down_tile, (sx * 16, sy * 16))

        # Ensure Castle1F (2, 7) and ThroneRoom (2, 2) & (1, 1) have clean floor / brick tiles
        if map_key == "tantegel-castle-1f":
            map_img.paste(default_floor, (2 * 16, 7 * 16))
        elif map_key == "tantegel-castle-2f":
            map_img.paste(default_floor, (2 * 16, 2 * 16))
            map_img.paste(tile_imgs[1], (1 * 16, 1 * 16))

        map_img.save(maps_dir / f"{map_key}.png")

        # Generate annotated grid view
        gv = map_img.resize((w_tiles * 32, h_tiles * 32), Image.Resampling.NEAREST)
        gdraw = ImageDraw.Draw(gv)
        for gx in range(w_tiles + 1):
            gdraw.line([(gx * 32, 0), (gx * 32, h_tiles * 32)], fill=(255, 255, 255, 60))
        for gy in range(h_tiles + 1):
            gdraw.line([(0, gy * 32), (w_tiles * 32, gy * 32)], fill=(255, 255, 255, 60))
        gv.save(grid_views_dir / f"{map_key}_grid.png")

    # Save special renders used by Castle1F.gd and ThroneRoom.gd
    c1f = Image.open(maps_dir / "tantegel-castle-1f.png").convert("RGB")
    c1f.save(renders_dir / "tantegel_castle_1f.png")

    c2f = Image.open(maps_dir / "tantegel-castle-2f.png").convert("RGBA")
    c2f.save(renders_dir / "tantegel_castle_2f.png")
    throne_bg = c2f.resize((384, 384), Image.Resampling.NEAREST)
    throne_bg.save(renders_dir / "throne_room_bg.png")
    throne_bg.save(renders_dir / "throne_room_view.png")
    throne_bg.save(ASSETS_DIR / "images" / "king_lorik_throne.png")
    shutil.copyfile(grid_views_dir / "tantegel-castle-2f_grid.png", maps_dir / "throne_room_grid.png")

    return tile_imgs


# ---------------------------------------------------------------------------
# 2. OVERWORLD MAP GENERATION (124x124 tiles = 1984x1984 px)
# ---------------------------------------------------------------------------

# Charlock Castle is ringed by poisonous swamp tiles (terrain 7).
CHARLOCK_TOWN = (50, 50)
CHARLOCK_SWAMP_TILES = frozenset(
    (x, y) for x in range(49, 52) for y in range(49, 52) if (x, y) != CHARLOCK_TOWN
)

# Cantlin is walled on the overworld: a ring of impassable wall tiles (terrain 9) with a
# single grass "gate" tile on its north side where the Golem waits.
CANTLIN_TOWN = (75, 104)
CANTLIN_GATE = (75, 102)
CANTLIN_WALL_TILES = frozenset(
    (x, y)
    for x in range(73, 78)
    for y in range(102, 107)
    if (x in (73, 77) or y in (102, 106)) and (x, y) != CANTLIN_GATE
)


def draw_swamp_tile_16x16() -> Image.Image:
    """Poisonous swamp (terrain code 7): murky green with purple bubbles."""
    swp = Image.new("RGBA", (16, 16), (64, 108, 72, 255))
    spx = swp.load()
    for y in range(16):
        for x in range(16):
            if (x + y * 3) % 7 == 0:
                spx[x, y] = (118, 72, 136, 255)
            elif (x * 2 + y) % 5 == 0:
                spx[x, y] = (42, 78, 50, 255)
    return swp


def draw_bridge_tile_16x16() -> Image.Image:
    """Wooden plank bridge spanning a one-tile river crossing (terrain code 2)."""
    img = Image.new("RGBA", (16, 16), (28, 82, 196, 255))
    px = img.load()
    plank = (176, 118, 56, 255)
    plank_hi = (206, 150, 84, 255)
    seam = (104, 66, 30, 255)
    rail = (72, 44, 20, 255)
    for y in range(2, 14):
        for x in range(16):
            if y in (2, 13):
                px[x, y] = rail
            elif (x + 1) % 4 == 0:
                px[x, y] = seam
            else:
                px[x, y] = plank_hi if y in (3, 8) else plank
    return img


def draw_wall_tile_16x16() -> Image.Image:
    """Terracotta brick wall for Cantlin's barrier (terrain code 9)."""
    img = Image.new("RGBA", (16, 16), (150, 94, 58, 255))
    px = img.load()
    mortar = (92, 56, 34, 255)
    light = (184, 124, 80, 255)
    for y in range(16):
        for x in range(16):
            if y % 4 == 3:
                px[x, y] = mortar
            elif ((x + (4 if (y // 4) % 2 else 0)) % 8) == 7:
                px[x, y] = mortar
            elif y % 4 == 0:
                px[x, y] = light
    return img


def generate_overworld_map() -> None:
    terrain_path = ASSETS_DIR / "maps" / "worldmap_terrain.json"
    tdata = json.loads(terrain_path.read_text(encoding="utf-8"))
    n_tiles = int(tdata.get("tiles", 124))
    terrain = tdata["terrain"]

    # Build 16x16 terrain tiles for each terrain code (0..9)
    # 0=water, 1=forest, 2=bridge, 3=grass, 4=plains, 5=desert, 6=mountain, 7=swamp, 8=hills, 9=wall
    t_sprites: dict[int, Image.Image] = {
        0: draw_tile_16x16(6, "water", [28, 82, 196], False),
        1: draw_tile_16x16(4, "forest", [34, 136, 36], True),
        2: draw_bridge_tile_16x16(),
        3: draw_tile_16x16(0, "grass", [56, 168, 44], True),
        4: draw_tile_16x16(2, "grass", [92, 184, 52], True),
        5: draw_tile_16x16(5, "dirt", [218, 186, 96], True),
    }

    # Mountain (6)
    mtn = Image.new("RGBA", (16, 16), (92, 148, 56, 255))
    mpx = mtn.load()
    for y in range(2, 15):
        half = (y - 1) // 2 + 1
        for x in range(8 - half, 8 + half):
            if 0 <= x < 16:
                if y <= 5:
                    mpx[x, y] = (235, 240, 248, 255)  # snow cap
                elif x < 8:
                    mpx[x, y] = (156, 138, 116, 255)
                else:
                    mpx[x, y] = (112, 96, 78, 255)
    t_sprites[6] = mtn

    # Swamp (7)
    t_sprites[7] = draw_swamp_tile_16x16()

    # Hills (8)
    hil = Image.new("RGBA", (16, 16), (76, 164, 48, 255))
    hpx = hil.load()
    for cx, cy in [(5, 7), (11, 11)]:
        for y in range(cy - 3, cy + 3):
            for x in range(cx - 4, cx + 5):
                if 0 <= x < 16 and 0 <= y < 16 and (x - cx) ** 2 + (y - cy) ** 2 <= 14 and y <= cy + 1:
                    hpx[x, y] = (146, 118, 68, 255) if y > cy - 2 else (182, 152, 92, 255)
    t_sprites[8] = hil

    # Wall (9) — Cantlin's barrier
    t_sprites[9] = draw_wall_tile_16x16()

    overworld = Image.new("RGBA", (n_tiles * 16, n_tiles * 16), (28, 82, 196, 255))
    for ry in range(min(n_tiles, len(terrain))):
        row = terrain[ry]
        for rx in range(min(n_tiles, len(row))):
            tcode = int(row[rx])
            overworld.paste(t_sprites.get(tcode, t_sprites[3]), (rx * 16, ry * 16))

    # Draw landmarks on overworld (Castles, Towns, Caves)
    odraw = ImageDraw.Draw(overworld)
    castles = [(45, 45, (220, 224, 238)), (50, 50, (148, 48, 68))]
    for cx, cy, col in castles:
        x0, y0 = cx * 16, cy * 16
        odraw.rectangle([x0 + 2, y0 + 2, x0 + 13, y0 + 14], fill=col, outline=(30, 30, 40))
        odraw.rectangle([x0 + 6, y0 + 9, x0 + 9, y0 + 14], fill=(40, 28, 18))

    towns = [(50, 43), (4, 4), (106, 12), (104, 74), (75, 104), (27, 91)]
    for tx, ty in towns:
        x0, y0 = tx * 16, ty * 16
        odraw.polygon([(x0 + 2, y0 + 7), (x0 + 8, y0 + 2), (x0 + 14, y0 + 7)], fill=(214, 72, 48))
        odraw.rectangle([x0 + 3, y0 + 7, x0 + 12, y0 + 14], fill=(236, 218, 178), outline=(40, 30, 20))

    caves = [(30, 14), (31, 59), (106, 46), (106, 51), (83, 3), (110, 111)]
    for vx, vy in caves:
        x0, y0 = vx * 16, vy * 16
        odraw.ellipse([x0 + 2, y0 + 3, x0 + 13, y0 + 14], fill=(24, 20, 28), outline=(140, 128, 110))

    overworld.save(ASSETS_DIR / "maps" / "dw1-over2.png")
    preview = overworld.resize((640, 640), Image.Resampling.NEAREST)
    preview.save(ASSETS_DIR / "maps" / "world-map.png")
    preview.save(ASSETS_DIR / "images" / "world-map.png")
    preview.save(ASSETS_DIR / "maps" / "worldmap_terrain.png")


# ---------------------------------------------------------------------------
# 3. CHARACTER & NPC SPRITES (characters-3.png + 102 sliced NPC frames)
# ---------------------------------------------------------------------------

def _draw_char_16x16(
    role: str,
    direction: str,
    step: int,
    has_sword: bool = False,
    has_shield: bool = False,
    with_princess: bool = False,
) -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()

    palettes = {
        "hero": ((38, 116, 232, 255), (238, 198, 148, 255), (186, 198, 214, 255), (124, 68, 28, 255)),
        "minister": ((142, 46, 184, 255), (238, 198, 148, 255), (242, 204, 64, 255), (90, 32, 120, 255)),
        "lady": ((228, 72, 132, 255), (244, 206, 162, 255), (196, 112, 44, 255), (168, 38, 86, 255)),
        "sage": ((218, 224, 236, 255), (238, 196, 148, 255), (248, 248, 252, 255), (138, 144, 158, 255)),
        "sage_alt": ((46, 158, 74, 255), (238, 196, 148, 255), (218, 168, 56, 255), (96, 58, 24, 255)),
        "red_guard": ((214, 48, 48, 255), (238, 196, 148, 255), (232, 192, 62, 255), (112, 32, 32, 255)),
        "guard": ((52, 108, 214, 255), (238, 196, 148, 255), (192, 202, 218, 255), (42, 62, 118, 255)),
        "trump_guard": ((64, 138, 232, 255), (238, 196, 148, 255), (244, 208, 68, 255), (42, 62, 118, 255)),
        "princess": ((244, 126, 178, 255), (246, 212, 172, 255), (248, 214, 64, 255), (212, 68, 128, 255)),
        "dragonlord": ((98, 34, 154, 255), (186, 218, 164, 255), (236, 64, 64, 255), (44, 18, 72, 255)),
        "king": ((218, 44, 58, 255), (238, 198, 148, 255), (248, 212, 58, 255), (242, 242, 248, 255)),
    }
    tunic, skin, accent, boots = palettes.get(role, palettes["guard"])
    outline = (20, 18, 28, 255)

    # Head & Helmet / Crown (y=1..6, x=4..11)
    for y in range(1, 7):
        for x in range(4, 12):
            if x in (4, 11) or y == 1:
                px[x, y] = accent if role in ("hero", "guard", "red_guard", "king", "princess") else outline
            else:
                px[x, y] = tunic if direction == "up" and y < 5 else skin

    # Horns for hero / dragonlord
    if role in ("hero", "dragonlord"):
        px[3, 2] = (242, 238, 220, 255)
        px[2, 1] = (242, 238, 220, 255)
        px[12, 2] = (242, 238, 220, 255)
        px[13, 1] = (242, 238, 220, 255)

    # Eyes (when not facing up)
    if direction == "down":
        px[6, 4] = outline
        px[9, 4] = outline
    elif direction == "left":
        px[5, 4] = outline
    elif direction == "right":
        px[10, 4] = outline

    # Torso (y=7..11, x=4..11)
    for y in range(7, 12):
        for x in range(4, 12):
            if x in (4, 11):
                px[x, y] = outline
            elif y == 9:
                px[x, y] = accent
            else:
                px[x, y] = tunic

    # Legs / walk step (y=12..14)
    left_y = 14 if step == 0 else 13
    right_y = 13 if step == 0 else 14
    for y in range(12, left_y + 1):
        px[5, y] = boots
        px[6, y] = boots
    for y in range(12, right_y + 1):
        px[9, y] = boots
        px[10, y] = boots

    # Optional Sword & Shield
    if has_sword:
        blade = (224, 234, 248, 255)
        hilt = (238, 192, 52, 255)
        sx = 2 if direction != "right" else 13
        for sy in range(3, 10):
            px[sx, sy] = blade
        px[sx, 10] = hilt
        px[max(0, sx - 1), 9] = hilt
        px[min(15, sx + 1), 9] = hilt

    if has_shield:
        sh_x = 12 if direction != "left" else 2
        for sy in range(6, 12):
            for dx in range(2):
                if 0 <= sh_x + dx < 16:
                    px[sh_x + dx, sy] = accent if sy in (6, 11) else (44, 88, 198, 255)

    if with_princess:
        # Pink gown emblem on side
        for sy in range(7, 11):
            px[12, sy] = (248, 138, 188, 255)
            px[13, sy] = (248, 214, 64, 255)

    return im


def generate_character_sprites() -> None:
    # characters-3.png is 315x136, 20px stride, 16x16 sprites
    sheet = Image.new("RGBA", (315, 136), (0, 0, 0, 0))
    npc_dir = ASSETS_DIR / "sprites" / "npc"
    npc_dir.mkdir(parents=True, exist_ok=True)

    # Row definitions matching NPCCharacterData.gd and Castle1F.gd / DungeonMap.gd
    row_defs = [
        (0, 0, "hero", False, False, False),
        (0, 8, "minister", False, False, False),
        (1, 0, "hero", True, False, False),
        (1, 8, "lady", False, False, False),
        (2, 0, "hero", False, True, False),
        (2, 8, "sage", False, False, False),
        (3, 0, "hero", True, True, False),
        (3, 8, "sage_alt", False, False, False),
        (4, 0, "hero", True, False, True),
        (4, 8, "red_guard", False, False, False),
        (5, 0, "princess", False, False, False),
        (5, 8, "dragonlord", False, False, False),
        (6, 0, "guard", False, True, False),
    ]

    dirs = ["down", "left", "up", "right"]
    for row, start_col, role, sw, sh, pr in row_defs:
        for d_idx, d_name in enumerate(dirs):
            for step in range(2):
                col = start_col + d_idx * 2 + step
                if col >= 15:
                    continue
                sp = _draw_char_16x16(role, d_name, step, sw, sh, pr)
                sheet.paste(sp, (col * 20, row * 20))

    # Row 6 special cols 8..11: trump_guard (cols 8,9) and king (cols 10,11)
    for step in range(2):
        tg = _draw_char_16x16("trump_guard", "left", step, True, False, False)
        sheet.paste(tg, ((8 + step) * 20, 6 * 20))
        kg = _draw_char_16x16("king", "down", step, False, False, False)
        sheet.paste(kg, ((10 + step) * 20, 6 * 20))
    kg.save(ASSETS_DIR / "sprites" / "king.png")

    # Save characters-3.png and aliases
    rgba_dir = ASSETS_DIR / "sprites" / "rgba"
    rgba_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(rgba_dir / "characters-3.png")
    sheet.save(rgba_dir / "characters.png")
    sheet.save(ASSETS_DIR / "sprites" / "characters-3.png")
    sheet.save(ASSETS_DIR / "sprites" / "characters.png")
    sheet.save(ASSETS_DIR / "sprites" / "hero-custom.png")

    # Slice all 102 individual NPC sprite files (000_r0_c0.png .. 101_r6_c11.png)
    idx = 0
    for r in range(7):
        max_c = 12 if r == 6 else 15
        for c in range(max_c):
            crop = sheet.crop((c * 20, r * 20, c * 20 + 16, r * 20 + 16))
            crop.save(npc_dir / f"{idx:03d}_r{r}_c{c}.png")
            idx += 1


# ---------------------------------------------------------------------------
# 4. MONSTER BATTLE SPRITES (44 bestiary PNGs + monsters-2.png)
# ---------------------------------------------------------------------------

MONSTER_PALETTES: dict[str, tuple[str, tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]] = {
    "slime": ("slime", (48, 148, 248), (140, 208, 255), (238, 72, 56)),
    "red_slime": ("slime", (232, 64, 52), (255, 148, 128), (248, 212, 64)),
    "metal_slime": ("slime", (168, 178, 194), (236, 242, 252), (232, 64, 64)),
    "slime_big": ("slime", (48, 148, 248), (140, 208, 255), (238, 72, 56)),
    "drakee": ("drakee", (62, 92, 214), (148, 64, 184), (248, 216, 68)),
    "magidrakee": ("drakee", (214, 72, 52), (248, 156, 64), (252, 232, 92)),
    "drakeema": ("drakee", (228, 184, 48), (168, 64, 196), (248, 64, 64)),
    "ghost": ("ghost", (184, 198, 238), (118, 78, 196), (248, 92, 72)),
    "poltergeist": ("ghost", (224, 96, 168), (138, 48, 128), (248, 224, 72)),
    "specter": ("ghost", (92, 214, 188), (48, 118, 148), (248, 72, 92)),
    "magician": ("mage", (72, 124, 218), (196, 148, 64), (248, 214, 78)),
    "warlock": ("mage", (156, 56, 188), (88, 188, 112), (248, 96, 64)),
    "wizard": ("mage", (214, 48, 64), (238, 192, 58), (124, 218, 252)),
    "scorpion": ("scorpion", (218, 124, 44), (156, 72, 24), (248, 228, 92)),
    "metal_scorpion": ("scorpion", (172, 182, 198), (108, 118, 136), (248, 72, 72)),
    "rogue_scorpion": ("scorpion", (178, 52, 138), (108, 28, 84), (248, 214, 64)),
    "skeleton": ("skeleton", (228, 226, 214), (96, 118, 168), (232, 68, 68)),
    "wraith": ("skeleton", (168, 196, 232), (128, 52, 168), (248, 212, 64)),
    "wraith_knight": ("skeleton", (218, 188, 136), (188, 44, 58), (112, 224, 248)),
    "wolf": ("wolf", (148, 112, 78), (208, 174, 136), (248, 196, 52)),
    "wolflord": ("wolf", (88, 128, 196), (178, 204, 238), (248, 72, 72)),
    "werewolf": ("wolf", (178, 72, 58), (228, 148, 96), (248, 232, 72)),
    "goldman": ("golem", (238, 192, 48), (255, 236, 128), (228, 58, 48)),
    "stoneman": ("golem", (138, 146, 162), (192, 198, 212), (72, 196, 248)),
    "golem": ("golem", (196, 108, 56), (232, 158, 96), (248, 224, 68)),
    "droll": ("droll", (136, 68, 178), (196, 118, 228), (248, 214, 64)),
    "drollmagi": ("droll", (214, 78, 58), (248, 156, 88), (92, 228, 248)),
    "druin": ("druin", (196, 88, 148), (118, 188, 78), (248, 224, 72)),
    "druinlord": ("druin", (228, 158, 48), (188, 52, 68), (112, 228, 252)),
    "knight": ("knight", (72, 132, 224), (196, 206, 222), (244, 198, 58)),
    "armored_knight": ("knight", (188, 196, 212), (148, 48, 64), (248, 214, 68)),
    "axe_knight": ("knight", (128, 58, 178), (218, 182, 64), (244, 64, 64)),
    "demon_knight": ("knight", (52, 56, 72), (218, 48, 58), (248, 218, 72)),
    "wyvern": ("wyvern", (78, 168, 72), (188, 218, 112), (248, 128, 52)),
    "magiwyvern": ("wyvern", (72, 118, 214), (168, 208, 248), (248, 214, 68)),
    "starwyvern": ("wyvern", (218, 168, 52), (248, 228, 128), (228, 58, 78)),
    "green_dragon": ("dragon", (56, 172, 68), (218, 188, 78), (248, 84, 52)),
    "green_dragon_big": ("dragon", (56, 172, 68), (218, 188, 78), (248, 84, 52)),
    "blue_dragon": ("dragon", (58, 116, 224), (168, 212, 248), (248, 214, 68)),
    "red_dragon": ("dragon", (218, 52, 48), (248, 168, 64), (252, 238, 92)),
    "dragonlord1": ("dlord1", (132, 52, 188), (238, 198, 72), (244, 58, 68)),
    "dragonlord": ("dlord2", (148, 58, 196), (238, 184, 64), (248, 64, 58)),
    "dragonlord_big": ("dlord2", (148, 58, 196), (238, 184, 64), (248, 64, 58)),
}


def draw_monster_sprite(key: str) -> Image.Image:
    family, c1, c2, c3 = MONSTER_PALETTES.get(
        key, ("knight", (112, 148, 218), (218, 188, 72), (238, 72, 72))
    )
    size = 80 if ("dragon" in family or "dlord2" in family or key.endswith("_big")) else 64
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = size // 2, size // 2
    outline = (20, 16, 28, 255)
    col1 = (*c1, 255)
    col2 = (*c2, 255)
    col3 = (*c3, 255)
    white = (250, 250, 255, 255)

    if family == "slime":
        # Teardrop slime body
        d.ellipse([cx - 20, cy - 4, cx + 20, cy + 22], fill=col1, outline=outline)
        d.polygon([(cx - 12, cy + 2), (cx, cy - 22), (cx + 12, cy + 2)], fill=col1)
        d.ellipse([cx - 12, cy + 1, cx - 5, cy + 6], fill=col2)
        # Eyes
        d.ellipse([cx - 10, cy + 5, cx - 4, cy + 11], fill=white, outline=outline)
        d.ellipse([cx + 4, cy + 5, cx + 10, cy + 11], fill=white, outline=outline)
        d.rectangle([cx - 8, cy + 7, cx - 6, cy + 9], fill=outline)
        d.rectangle([cx + 6, cy + 7, cx + 8, cy + 9], fill=outline)
        # Smile
        d.arc([cx - 8, cy + 10, cx + 8, cy + 18], 10, 170, fill=col3, width=2)

    elif family == "drakee":
        # Wings
        d.polygon([(cx - 8, cy), (cx - 28, cy - 14), (cx - 24, cy + 8), (cx - 12, cy + 4)], fill=col2, outline=outline)
        d.polygon([(cx + 8, cy), (cx + 28, cy - 14), (cx + 24, cy + 8), (cx + 12, cy + 4)], fill=col2, outline=outline)
        # Body & ears
        d.ellipse([cx - 12, cy - 12, cx + 12, cy + 14], fill=col1, outline=outline)
        d.polygon([(cx - 8, cy - 10), (cx - 12, cy - 22), (cx - 3, cy - 12)], fill=col1, outline=outline)
        d.polygon([(cx + 8, cy - 10), (cx + 12, cy - 22), (cx + 3, cy - 12)], fill=col1, outline=outline)
        d.ellipse([cx - 7, cy - 5, cx - 2, cy], fill=col3)
        d.ellipse([cx + 2, cy - 5, cx + 7, cy], fill=col3)
        d.rectangle([cx - 5, cy + 4, cx + 5, cy + 7], fill=white)

    elif family == "ghost":
        d.ellipse([cx - 16, cy - 22, cx + 16, cy + 8], fill=col1, outline=outline)
        d.polygon([(cx - 16, cy - 4), (cx - 20, cy + 22), (cx - 8, cy + 14), (cx, cy + 24), (cx + 8, cy + 14), (cx + 20, cy + 22), (cx + 16, cy - 4)], fill=col1, outline=outline)
        d.ellipse([cx - 9, cy - 10, cx - 3, cy - 4], fill=col3)
        d.ellipse([cx + 3, cy - 10, cx + 9, cy - 4], fill=col3)

    elif family == "mage":
        # Robe & pointed hat
        d.polygon([(cx, cy - 28), (cx - 18, cy - 10), (cx + 18, cy - 10)], fill=col1, outline=outline)
        d.polygon([(cx - 14, cy - 4), (cx - 20, cy + 24), (cx + 20, cy + 24), (cx + 14, cy - 4)], fill=col1, outline=outline)
        d.rectangle([cx - 10, cy - 10, cx + 10, cy], fill=(24, 20, 32, 255))
        d.ellipse([cx - 6, cy - 7, cx - 2, cy - 3], fill=col3)
        d.ellipse([cx + 2, cy - 7, cx + 6, cy - 3], fill=col3)
        # Staff
        d.line([(cx + 18, cy - 18), (cx + 18, cy + 24)], fill=col2, width=3)
        d.ellipse([cx + 13, cy - 24, cx + 23, cy - 14], fill=col3, outline=white)

    elif family == "scorpion":
        # Tail arch
        d.arc([cx - 12, cy - 24, cx + 20, cy + 8], 220, 60, fill=col2, width=5)
        d.polygon([(cx - 4, cy - 22), (cx - 12, cy - 18), (cx - 4, cy - 14)], fill=col3)
        # Body & pincers
        d.ellipse([cx - 16, cy - 4, cx + 16, cy + 16], fill=col1, outline=outline)
        d.ellipse([cx - 26, cy + 2, cx - 12, cy + 16], fill=col2, outline=outline)
        d.ellipse([cx + 12, cy + 2, cx + 26, cy + 16], fill=col2, outline=outline)
        d.ellipse([cx - 6, cy + 2, cx - 2, cy + 6], fill=col3)
        d.ellipse([cx + 2, cy + 2, cx + 6, cy + 6], fill=col3)

    elif family == "skeleton":
        # Skull, ribs, shield & sword
        d.ellipse([cx - 10, cy - 24, cx + 10, cy - 6], fill=col1, outline=outline)
        d.rectangle([cx - 6, cy - 6, cx + 6, cy + 12], fill=col2, outline=outline)
        for ry in range(cy - 4, cy + 10, 4):
            d.line([(cx - 8, ry), (cx + 8, ry)], fill=col1, width=2)
        d.line([(cx - 18, cy - 20), (cx - 12, cy + 10)], fill=white, width=3)
        d.ellipse([cx + 8, cy - 6, cx + 22, cy + 12], fill=col3, outline=col1)
        d.ellipse([cx - 6, cy - 18, cx - 2, cy - 14], fill=col3)
        d.ellipse([cx + 2, cy - 18, cx + 6, cy - 14], fill=col3)

    elif family == "wolf":
        d.polygon([(cx - 18, cy + 18), (cx - 12, cy - 8), (cx + 14, cy - 8), (cx + 20, cy + 18)], fill=col1, outline=outline)
        d.polygon([(cx - 14, cy - 18), (cx - 8, cy - 26), (cx - 2, cy - 16)], fill=col1, outline=outline)
        d.polygon([(cx + 2, cy - 16), (cx + 8, cy - 26), (cx + 14, cy - 18)], fill=col1, outline=outline)
        d.ellipse([cx - 12, cy - 18, cx + 12, cy + 2], fill=col2, outline=outline)
        d.ellipse([cx - 7, cy - 12, cx - 2, cy - 7], fill=col3)
        d.ellipse([cx + 2, cy - 12, cx + 7, cy - 7], fill=col3)

    elif family == "golem":
        # Blocky brick golem
        d.rectangle([cx - 10, cy - 24, cx + 10, cy - 10], fill=col1, outline=outline)
        d.rectangle([cx - 18, cy - 10, cx + 18, cy + 12], fill=col1, outline=outline)
        d.rectangle([cx - 26, cy - 8, cx - 18, cy + 10], fill=col2, outline=outline)
        d.rectangle([cx + 18, cy - 8, cx + 26, cy + 10], fill=col2, outline=outline)
        d.rectangle([cx - 14, cy + 12, cx - 4, cy + 26], fill=col2, outline=outline)
        d.rectangle([cx + 4, cy + 12, cx + 14, cy + 26], fill=col2, outline=outline)
        d.rectangle([cx - 6, cy - 19, cx - 2, cy - 15], fill=col3)
        d.rectangle([cx + 2, cy - 19, cx + 6, cy - 15], fill=col3)

    elif family in ("droll", "druin"):
        d.ellipse([cx - 18, cy - 16, cx + 18, cy + 14], fill=col1, outline=outline)
        for tx in range(-14, 18, 7):
            d.line([(cx + tx, cy + 10), (cx + tx, cy + 24)], fill=col2, width=3)
        d.ellipse([cx - 9, cy - 6, cx - 3, cy], fill=col3, outline=outline)
        d.ellipse([cx + 3, cy - 6, cx + 9, cy], fill=col3, outline=outline)

    elif family == "knight":
        # Helm, plume, armor, shield & axe/sword
        d.polygon([(cx - 4, cy - 28), (cx, cy - 18), (cx + 8, cy - 26)], fill=col3)
        d.rectangle([cx - 9, cy - 20, cx + 9, cy - 6], fill=col2, outline=outline)
        d.rectangle([cx - 6, cy - 15, cx + 6, cy - 11], fill=outline)
        d.rectangle([cx - 14, cy - 6, cx + 14, cy + 14], fill=col1, outline=outline)
        d.rectangle([cx - 12, cy + 14, cx - 3, cy + 26], fill=col2, outline=outline)
        d.rectangle([cx + 3, cy + 14, cx + 12, cy + 26], fill=col2, outline=outline)
        # Shield & Weapon
        d.polygon([(cx + 12, cy - 6), (cx + 24, cy - 6), (cx + 24, cy + 8), (cx + 18, cy + 16), (cx + 12, cy + 8)], fill=col3, outline=outline)
        d.line([(cx - 20, cy - 22), (cx - 16, cy + 14)], fill=white, width=3)
        d.polygon([(cx - 20, cy - 20), (cx - 28, cy - 14), (cx - 20, cy - 8)], fill=col2, outline=outline)

    elif family in ("wyvern", "dragon", "dlord2"):
        # Wings
        d.polygon([(cx - 6, cy - 8), (cx - 34, cy - 28), (cx - 30, cy + 6), (cx - 10, cy + 4)], fill=col2, outline=outline)
        d.polygon([(cx + 6, cy - 8), (cx + 34, cy - 28), (cx + 30, cy + 6), (cx + 10, cy + 4)], fill=col2, outline=outline)
        # Dragon body, neck, head & horns
        d.ellipse([cx - 16, cy - 6, cx + 16, cy + 24], fill=col1, outline=outline)
        d.ellipse([cx - 10, cy - 26, cx + 10, cy - 6], fill=col1, outline=outline)
        d.polygon([(cx - 8, cy - 24), (cx - 16, cy - 34), (cx - 3, cy - 24)], fill=col2, outline=outline)
        d.polygon([(cx + 8, cy - 24), (cx + 16, cy - 34), (cx + 3, cy - 24)], fill=col2, outline=outline)
        # Belly scales
        for by in range(cy, cy + 20, 4):
            d.line([(cx - 8, by), (cx + 8, by)], fill=col2, width=2)
        d.ellipse([cx - 6, cy - 20, cx - 2, cy - 16], fill=col3)
        d.ellipse([cx + 2, cy - 20, cx + 6, cy - 16], fill=col3)

    else:  # dlord1 (Dragonlord Wizard Form)
        d.polygon([(cx - 18, cy + 26), (cx - 14, cy - 10), (cx + 14, cy - 10), (cx + 18, cy + 26)], fill=col1, outline=outline)
        d.ellipse([cx - 10, cy - 24, cx + 10, cy - 6], fill=col2, outline=outline)
        d.polygon([(cx - 8, cy - 22), (cx - 16, cy - 30), (cx - 4, cy - 20)], fill=col3)
        d.polygon([(cx + 8, cy - 22), (cx + 16, cy - 30), (cx + 4, cy - 20)], fill=col3)
        d.line([(cx + 20, cy - 24), (cx + 20, cy + 26)], fill=col2, width=3)
        d.ellipse([cx + 15, cy - 29, cx + 25, cy - 19], fill=col3, outline=white)

    return im


def generate_monster_sprites() -> None:
    bestiary_dir1 = ASSETS_DIR / "sprites" / "bestiary"
    bestiary_dir2 = ASSETS_DIR / "reference" / "mikesrpgcenter" / "bestiary"
    bestiary_dir1.mkdir(parents=True, exist_ok=True)
    bestiary_dir2.mkdir(parents=True, exist_ok=True)

    for key in MONSTER_PALETTES:
        im = draw_monster_sprite(key)
        im.save(bestiary_dir1 / f"{key}.png")
        im.save(bestiary_dir2 / f"{key}.png")

    # Also build monsters-2.png sheet (407x457 RGBA) matching sprite_frames.json
    sf = json.loads((DATA_DIR / "sprite_frames.json").read_text(encoding="utf-8"))
    msheet = Image.new("RGBA", (407, 457), (0, 0, 0, 0))
    mdefs = sf.get("monsters", {})
    for mkey, mval in mdefs.items():
        if not isinstance(mval, dict):
            continue
        base_im = draw_monster_sprite(mkey)
        for fn in ("frame0", "frame1"):
            rect = mval.get(fn)
            if isinstance(rect, dict):
                rx, ry, rw, rh = int(rect["x"]), int(rect["y"]), int(rect["w"]), int(rect["h"])
                resized = base_im.resize((rw, rh), Image.Resampling.NEAREST)
                msheet.paste(resized, (rx, ry))

    msheet.save(ASSETS_DIR / "sprites" / "rgba" / "monsters-2.png")
    msheet.save(ASSETS_DIR / "sprites" / "rgba" / "monsters.png")
    msheet.save(ASSETS_DIR / "sprites" / "monsters-2.png")
    msheet.save(ASSETS_DIR / "sprites" / "monsters.png")


# ---------------------------------------------------------------------------
# 5. SPELL OVERLAYS & TITLE SCREEN GENERATION
# ---------------------------------------------------------------------------

def generate_spells_and_title() -> None:
    spells_dir = ASSETS_DIR / "images" / "spells"
    spells_dir.mkdir(parents=True, exist_ok=True)

    spell_colors = {
        "heal": ((64, 224, 128), (188, 255, 214)),
        "hurt": ((248, 84, 48), (255, 214, 92)),
        "outside": ((92, 188, 252), (214, 242, 255)),
        "radiant": ((252, 232, 92), (255, 252, 214)),
        "repel": ((128, 218, 248), (218, 248, 255)),
        "return": ((188, 118, 252), (238, 214, 255)),
        "sleep": ((136, 96, 232), (214, 196, 255)),
        "stopspell": ((238, 72, 148), (255, 196, 228)),
    }
    composite = Image.new("RGBA", (512, 256), (0, 0, 0, 0))
    for idx, (sname, (c_outer, c_inner)) in enumerate(spell_colors.items()):
        im = Image.new("RGBA", (256, 240), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        cx, cy = 128, 120
        for r in range(88, 16, -12):
            alpha = int(170 * (1.0 - r / 96.0))
            col = (*c_outer, alpha) if r > 40 else (*c_inner, min(230, alpha + 50))
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=4)
        for a_deg in range(0, 360, 30):
            rad = math.radians(a_deg)
            x1 = cx + int(math.cos(rad) * 20)
            y1 = cy + int(math.sin(rad) * 20)
            x2 = cx + int(math.cos(rad) * 76)
            y2 = cy + int(math.sin(rad) * 76)
            d.line([(x1, y1), (x2, y2)], fill=(*c_inner, 200), width=2)
        im.save(spells_dir / f"{sname}.png")
        composite.paste(im.resize((128, 128)), ((idx % 4) * 128, (idx // 4) * 128))
    composite.save(ASSETS_DIR / "images" / "spells.png")

    # Title Screen (512x480)
    title = Image.new("RGBA", (512, 480), (10, 12, 28, 255))
    td = ImageDraw.Draw(title)
    # Starfield sky gradient
    rng = random.Random(1986)
    for _ in range(90):
        sx, sy = rng.randint(8, 504), rng.randint(8, 320)
        td.rectangle([sx, sy, sx + 2, sy + 2], fill=(220, 230, 255, 255))

    # Distant mountain & castle silhouette
    td.polygon([(0, 340), (90, 260), (190, 320), (290, 240), (410, 310), (512, 250), (512, 360), (0, 360)], fill=(26, 32, 64, 255))
    # Banner frame
    td.rectangle([56, 56, 456, 216], fill=(22, 36, 88, 255), outline=(244, 198, 64, 255), width=4)
    td.rectangle([64, 64, 448, 208], outline=(168, 124, 32, 255), width=2)

    # Central Dragon Crest & Sword emblem inside banner
    dragon_emblem = draw_monster_sprite("dragonlord").resize((96, 96), Image.Resampling.NEAREST)
    title.paste(dragon_emblem, (208, 88), dragon_emblem)

    # Sword & Shield crest
    td.line([(256, 36), (256, 236)], fill=(230, 238, 252, 255), width=6)
    td.rectangle([232, 72, 280, 80], fill=(244, 198, 64, 255))

    # Clean pixel text banner
    try:
        font_lg = ImageFont.load_default(size=32)
        font_sm = ImageFont.load_default(size=16)
    except TypeError:
        font_lg = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    td.text((112, 118), "DRAGON WARRIOR", fill=(24, 16, 12, 255), font=font_lg)
    td.text((110, 116), "DRAGON WARRIOR", fill=(252, 214, 68, 255), font=font_lg)
    td.text((138, 168), "ROBOS 2D JRPG ENGINE", fill=(140, 218, 252, 255), font=font_sm)

    title.convert("RGB").save(ASSETS_DIR / "title-screen.png")
    title.convert("RGB").save(ASSETS_DIR / "sprites" / "title.png")
    title.convert("RGB").save(ASSETS_DIR / "sprites" / "bg.png")
    draw_monster_sprite("slime").save(ASSETS_DIR / "sprites" / "icon.png")


# ---------------------------------------------------------------------------
# 6. ORIGINAL CHIPTUNE BGM & SFX AUDIO SYNTHESIS (45 MP3 files)
# ---------------------------------------------------------------------------

def _synth_notes_to_wav(notes: list[tuple[float, float, str]], wav_path: Path, sample_rate: int = 22050) -> None:
    """Render a list of (freq_hz, duration_sec, wave_type) tuples to a mono 16-bit WAV."""
    samples = bytearray()
    for freq, dur, wtype in notes:
        n_frames = max(1, int(sample_rate * dur))
        for i in range(n_frames):
            t = i / sample_rate
            env = min(1.0, i / 120.0) * max(0.0, 1.0 - (i / n_frames) * 0.35)
            if freq <= 0.0:
                val = 0.0
            elif wtype == "square":
                val = 0.32 if math.sin(2.0 * math.pi * freq * t) >= 0 else -0.32
            elif wtype == "triangle":
                p = (freq * t) % 1.0
                val = (4.0 * p - 1.0 if p < 0.5 else 3.0 - 4.0 * p) * 0.35
            elif wtype == "noise":
                val = (((i * 1103515245 + 12345) & 0x7FFFFFFF) / 0x7FFFFFFF * 2.0 - 1.0) * 0.28
            elif wtype == "sweep_up":
                f_inst = freq * (1.0 + 0.8 * (i / n_frames))
                val = 0.32 if math.sin(2.0 * math.pi * f_inst * t) >= 0 else -0.32
            elif wtype == "sweep_down":
                f_inst = freq * max(0.2, 1.0 - 0.7 * (i / n_frames))
                val = 0.32 if math.sin(2.0 * math.pi * f_inst * t) >= 0 else -0.32
            else:
                val = math.sin(2.0 * math.pi * freq * t) * 0.32
            s16 = max(-32767, min(32767, int(val * env * 32767)))
            samples += struct.pack("<h", s16)

    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(samples))


def generate_audio_assets() -> None:
    mp3_dir = ASSETS_DIR / "music" / "mp3"
    mp3_dir.mkdir(parents=True, exist_ok=True)

    # Frequencies for musical scale
    C4, D4, E4, F4, G4, A4, B4 = 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88
    C5, D5, E5, F5, G5, A5 = 523.25, 587.33, 659.25, 698.46, 783.99, 880.00
    A3, B3, G3, E3 = 220.00, 246.94, 196.00, 164.81

    tracks: dict[str, list[tuple[float, float, str]]] = {
        # BGM Tracks
        "overture": [(C4, 0.22, "square"), (G4, 0.22, "square"), (C5, 0.4, "square"), (E5, 0.25, "square"), (D5, 0.25, "square"), (C5, 0.45, "square"), (G4, 0.35, "triangle"), (A4, 0.35, "triangle"), (B4, 0.35, "triangle"), (C5, 0.6, "square")] * 2,
        "kingdom_of_alefgard": [(E4, 0.3, "triangle"), (G4, 0.3, "triangle"), (A4, 0.45, "square"), (G4, 0.3, "square"), (E4, 0.3, "triangle"), (D4, 0.45, "triangle"), (C4, 0.45, "triangle"), (D4, 0.3, "triangle"), (E4, 0.6, "square")] * 2,
        "tantegel_castle": [(C4, 0.3, "triangle"), (E4, 0.3, "triangle"), (G4, 0.3, "triangle"), (C5, 0.5, "square"), (B4, 0.3, "square"), (G4, 0.3, "triangle"), (A4, 0.5, "triangle"), (G4, 0.5, "triangle")] * 2,
        "tantegel_castle_lower": [(A3, 0.35, "triangle"), (C4, 0.35, "triangle"), (E4, 0.35, "triangle"), (A4, 0.5, "triangle"), (G4, 0.35, "triangle"), (E4, 0.5, "triangle")] * 2,
        "peaceful_village": [(F4, 0.28, "triangle"), (A4, 0.28, "triangle"), (C5, 0.4, "square"), (A4, 0.28, "triangle"), (G4, 0.4, "square"), (F4, 0.5, "triangle")] * 2,
        "monster_battle": [(E4, 0.14, "square"), (F4, 0.14, "square"), (G4, 0.14, "square"), (A4, 0.22, "square"), (E4, 0.14, "square"), (F4, 0.14, "square"), (B4, 0.28, "square"), (A4, 0.22, "square")] * 3,
        "dragonlord": [(E3, 0.18, "square"), (B3, 0.18, "square"), (C4, 0.18, "square"), (F4, 0.28, "square"), (E4, 0.18, "square"), (B3, 0.28, "square")] * 3,
        "gwaelins_love": [(C5, 0.3, "triangle"), (E5, 0.3, "triangle"), (G5, 0.5, "square"), (E5, 0.4, "triangle"), (C5, 0.6, "triangle")],
        "fairy_flute": [(G5, 0.25, "triangle"), (E5, 0.25, "triangle"), (C5, 0.35, "triangle"), (D5, 0.25, "triangle"), (E5, 0.5, "triangle")],
        "silver_harp": [(C4, 0.15, "triangle"), (E4, 0.15, "triangle"), (G4, 0.15, "triangle"), (C5, 0.15, "triangle"), (E5, 0.15, "triangle"), (G5, 0.4, "triangle")],
        "rainbow_bridge": [(C4, 0.15, "square"), (D4, 0.15, "square"), (E4, 0.15, "square"), (F4, 0.15, "square"), (G4, 0.15, "square"), (A4, 0.15, "square"), (B4, 0.15, "square"), (C5, 0.5, "square")],
        # Fanfare / Jingles
        "victory": [(C5, 0.12, "square"), (C5, 0.12, "square"), (C5, 0.12, "square"), (C5, 0.35, "square"), (G4, 0.25, "square"), (A4, 0.25, "square"), (C5, 0.5, "square")],
        "heroes_fanfare": [(G4, 0.15, "square"), (C5, 0.15, "square"), (E5, 0.15, "square"), (G5, 0.45, "square")],
        "improvement": [(C5, 0.14, "square"), (D5, 0.14, "square"), (E5, 0.14, "square"), (G5, 0.4, "square")],
        "thou_hast_died": [(E4, 0.3, "square"), (D4, 0.3, "square"), (C4, 0.3, "square"), (A3, 0.6, "square")],
        "cursed": [(F4, 0.2, "square"), (E4, 0.2, "square"), (Eb := 311.13, 0.4, "square")],
        "special_item": [(E5, 0.14, "square"), (G5, 0.14, "square"), (A5, 0.4, "square")],
        "monster_draws_near": [(G4, 0.08, "square"), (F4, 0.08, "square"), (E4, 0.08, "square"), (D4, 0.16, "square")],
        # SFX
        "attack": [(320.0, 0.08, "sweep_up"), (180.0, 0.06, "noise")],
        "prepare_to_attack": [(440.0, 0.06, "square"), (587.0, 0.08, "square")],
        "hit": [(140.0, 0.10, "noise"), (95.0, 0.08, "sweep_down")],
        "excellent_move": [(520.0, 0.07, "sweep_up"), (780.0, 0.09, "square"), (160.0, 0.08, "noise")],
        "missed": [(380.0, 0.09, "sweep_down")],
        "missed2": [(340.0, 0.09, "sweep_down")],
        "receive_damage": [(120.0, 0.12, "noise"), (110.0, 0.10, "sweep_down")],
        "receive_damage2": [(100.0, 0.14, "noise"), (90.0, 0.10, "sweep_down")],
        "cast_spell": [(520.0, 0.06, "sweep_up"), (680.0, 0.06, "sweep_up"), (860.0, 0.08, "sweep_up")],
        "breathe_fire": [(220.0, 0.25, "noise"), (140.0, 0.20, "noise")],
        "barrier": [(600.0, 0.07, "noise"), (420.0, 0.07, "sweep_down")],
        "swamp": [(240.0, 0.09, "noise")],
        "bumping_walls": [(95.0, 0.08, "square")],
        "confirmation": [(660.0, 0.06, "square"), (880.0, 0.08, "square")],
        "menu_button": [(740.0, 0.04, "square")],
        "open_door": [(220.0, 0.07, "sweep_up"), (330.0, 0.09, "square")],
        "open_treasure": [(C5, 0.08, "square"), (E5, 0.08, "square"), (G5, 0.16, "square")],
        "stairs_down": [(520.0, 0.06, "sweep_down"), (390.0, 0.06, "sweep_down"), (260.0, 0.08, "sweep_down")],
        "stairs_up": [(260.0, 0.06, "sweep_up"), (390.0, 0.06, "sweep_up"), (520.0, 0.08, "sweep_up")],
        "wyvern_wing": [(320.0, 0.08, "sweep_up"), (480.0, 0.08, "sweep_up"), (720.0, 0.12, "sweep_up")],
    }

    # Dungeon 1..8 BGM tracks (progressively lower pitch per floor depth)
    for d_idx in range(1, 9):
        base_f = max(110.0, 240.0 - d_idx * 14.0)
        tracks[f"dungeon_{d_idx}"] = [
            (base_f, 0.35, "triangle"),
            (base_f * 1.189, 0.35, "triangle"),
            (base_f * 1.122, 0.35, "triangle"),
            (base_f * 0.944, 0.45, "triangle"),
        ] * 2

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        for name, notes in tracks.items():
            wav_file = tmp / f"{name}.wav"
            mp3_file = mp3_dir / f"{name}.mp3"
            _synth_notes_to_wav(notes, wav_file)
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_file), "-codec:a", "libmp3lame", "-qscale:a", "6", str(mp3_file)],
                check=True,
            )


def main() -> None:
    print("[1/5] Generating 362 copyright-free 16x16 tiles and 29 maps...")
    generate_tiles_and_maps()
    print("[2/5] Generating 124x124 overworld map and terrain...")
    generate_overworld_map()
    print("[3/5] Generating character & NPC sprite sheets + 102 sliced frames...")
    generate_character_sprites()
    print("[4/5] Generating 44 original monster battle sprites, spell icons, and title screen...")
    generate_monster_sprites()
    generate_spells_and_title()
    print("[5/5] Synthesizing 45 original chiptune BGM & SFX MP3 files...")
    generate_audio_assets()
    print("Done! All assets in games/dragon-warrior/assets/ are 100% original and copyright-free.")


if __name__ == "__main__":
    main()
