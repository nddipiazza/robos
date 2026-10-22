#!/usr/bin/env python3
"""
Procedural Copyright-Free Asset & Chiptune Audio Generator for RobOS Quest: Warrior Dragon.

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


NPC_TILE_SPECS: dict[int, tuple[int, str, str]] = {
    5:  (0, "red_guard", "down"),
    7:  (3, "sage_alt", "down"),
    9:  (3, "lady", "left"),
    11: (0, "lady", "down"),
    13: (3, "minister", "down"),
    14: (3, "sage", "down"),
    15: (0, "minister", "down"),
    17: (3, "sage_alt", "right"),
    19: (0, "minister", "up"),
    20: (3, "sage_alt", "left"),
    21: (3, "guard", "up"),
    23: (3, "minister", "right"),
    25: (3, "sage_alt", "right"),
    26: (3, "guard", "right"),
    27: (3, "lady", "left"),
    28: (0, "sage", "down"),
    29: (3, "sage", "down"),
    65: (3, "dragonlord", "down"),
    72: (2, "sage", "down"),
    73: (3, "guard", "left"),
    74: (3, "guard", "right"),
    75: (3, "sage_alt", "up"),
    76: (0, "lady", "down"),
    77: (3, "sage_alt", "up"),
    78: (3, "red_guard", "down"),
    79: (0, "guard", "down"),
    80: (0, "minister", "down"),
    81: (0, "sage_alt", "up"),
    82: (3, "trump_guard", "left"),
    83: (3, "minister", "up"),
    84: (0, "sage", "right"),
    85: (3, "sage_alt", "right"),
    86: (3, "sage", "down"),
    87: (3, "princess", "down"),
    88: (3, "guard", "down"),
    89: (3, "guard", "right"),
    91: (3, "king", "down"),
}


def _draw_grass_tile(px, tid: int = 0) -> None:
    base = (116, 204, 20, 255)
    mid = (104, 192, 16, 255)
    hi = (140, 220, 36, 255)
    tuft_dk = (24, 108, 12, 255)
    tuft_md = (44, 144, 16, 255)
    for y in range(16):
        for x in range(16):
            v = (x * 5 + y * 9 + tid) % 7
            px[x, y] = hi if v == 0 else (mid if v in (2, 5) else base)
    for bx, by in [(2, 2), (10, 1), (6, 4), (13, 5), (1, 7), (11, 9), (4, 11), (14, 12), (7, 14), (2, 14)]:
        px[bx, by] = tuft_dk
        if bx + 1 < 16:
            px[bx + 1, by] = tuft_md
    px[8, 8] = base


def _draw_stone_block_tile(px, water_top: bool = False) -> None:
    face = (168, 172, 180, 255)
    hi = (206, 210, 218, 255)
    lo = (128, 132, 142, 255)
    dark = (22, 24, 30, 255)
    for y in range(16):
        for x in range(16):
            if x in (0, 15) or y in (0, 15):
                px[x, y] = lo
            elif x == 1 or y == 1:
                px[x, y] = hi
            elif x == 14 or y == 14:
                px[x, y] = lo
            else:
                px[x, y] = face
    # Corner and mid-edge sculpted boulder crevices (matching classic DW1 stone block)
    crevices = [
        (0, 0), (1, 0), (0, 1), (14, 0), (15, 0), (15, 1),
        (0, 14), (0, 15), (1, 15), (14, 15), (15, 14), (15, 15),
        (7, 0), (8, 0), (0, 7), (0, 8), (15, 7), (15, 8), (7, 15), (8, 15),
        (3, 3), (4, 3), (3, 4), (2, 5),
        (11, 3), (12, 3), (12, 4), (13, 5),
        (3, 11), (3, 12), (4, 12), (2, 10),
        (12, 11), (11, 12), (12, 12), (13, 10),
    ]
    for cx, cy in crevices:
        px[cx, cy] = dark
    for hx, hy in [(4, 4), (5, 4), (4, 5), (10, 4), (11, 4), (4, 10), (5, 10), (10, 11), (11, 11)]:
        px[hx, hy] = hi
    if water_top:
        for x in range(16):
            px[x, 0] = (32, 128, 240, 255)
    px[8, 8] = face


def _draw_sand_tile(px, tid: int = 2) -> None:
    sand = (240, 210, 160, 255)
    sand_hi = (248, 222, 176, 255)
    sand_lo = (224, 192, 140, 255)
    pebble = (36, 24, 14, 255)
    pebble_sh = (168, 132, 88, 255)
    for y in range(16):
        for x in range(16):
            v = (x * 3 + y * 7 + tid) % 6
            px[x, y] = sand_hi if v == 0 else (sand_lo if v == 3 else sand)
    pebbles = [
        (2, 1), (8, 2), (13, 2), (5, 4), (11, 5), (1, 6),
        (14, 8), (4, 9), (9, 10), (2, 12), (12, 12), (6, 14), (14, 15),
    ]
    for px_x, px_y in pebbles:
        px[px_x, px_y] = pebble
        if px_x + 1 < 16 and (px_x + 1, px_y) != (8, 8):
            px[px_x + 1, px_y] = pebble_sh
    px[8, 8] = sand


def _draw_brick_tile(px) -> None:
    brick_hi = (224, 78, 44, 255)
    brick_mid = (196, 54, 28, 255)
    brick_lo = (156, 38, 18, 255)
    mortar = (22, 12, 10, 255)
    for y in range(16):
        course = y // 4
        ry = y % 4
        # Courses 0 & 2 have vertical mortar at x=3,11; courses 1 & 3 at x=7,15
        v_joints = (3, 11) if (course % 2 == 0) else (7, 15)
        for x in range(16):
            if ry == 3 or x in v_joints:
                px[x, y] = mortar
            elif ry == 0:
                px[x, y] = brick_hi
            elif ry == 1:
                px[x, y] = brick_mid
            else:
                px[x, y] = brick_lo
    px[8, 8] = brick_hi


def _draw_trees_tile(px) -> None:
    grass = (112, 200, 20, 255)
    dark = (16, 32, 10, 255)
    leaf_dk = (28, 112, 14, 255)
    leaf_md = (52, 160, 22, 255)
    leaf_hi = (120, 214, 34, 255)
    trunk = (180, 118, 48, 255)
    trunk_sh = (116, 68, 22, 255)
    for y in range(16):
        for x in range(16):
            px[x, y] = grass if (y >= 13 or y == 0) else dark
    for tx0 in (0, 8):
        for y in range(1, 12):
            for lx in range(8):
                x = tx0 + lx
                # Canopy silhouette
                if y == 1 and lx in (2, 3, 4, 5):
                    px[x, y] = leaf_hi if lx in (2, 3) else leaf_md
                elif y == 2 and 1 <= lx <= 6:
                    px[x, y] = leaf_dk if lx in (1, 6) else (leaf_hi if lx <= 4 else leaf_md)
                elif 3 <= y <= 9 and 0 <= lx <= 7:
                    if lx in (0, 7):
                        px[x, y] = dark if y in (3, 9) else leaf_dk
                    elif (lx, y) in ((2, 4), (3, 3), (2, 6), (4, 5), (3, 7)):
                        px[x, y] = leaf_hi
                    elif y >= 8 or lx >= 5:
                        px[x, y] = leaf_dk
                    else:
                        px[x, y] = leaf_md
                elif y == 10 and 1 <= lx <= 6:
                    px[x, y] = leaf_dk if lx in (1, 6) else leaf_md
                elif y == 11 and lx in (2, 5):
                    px[x, y] = dark
        # Tree trunk & roots
        for y in range(11, 15):
            px[tx0 + 3, y] = trunk
            px[tx0 + 4, y] = trunk_sh
        px[tx0 + 2, 14] = trunk
        px[tx0 + 5, 14] = trunk_sh
        px[tx0 + 1, 15] = dark
        px[tx0 + 6, 15] = dark
    px[8, 8] = leaf_md


def _draw_water_tile(px, shore_edges: set[str] | None = None) -> None:
    water = (28, 124, 238, 255)
    deep = (20, 102, 212, 255)
    wave = (244, 250, 255, 255)
    foam = (132, 198, 255, 255)
    for y in range(16):
        for x in range(16):
            px[x, y] = deep if (x + y * 2) % 7 == 0 else water
    # Classic gull-wing white wave crests
    for wx, wy in [(2, 2), (10, 4), (5, 8), (1, 12), (11, 13)]:
        px[wx, wy] = foam
        px[wx + 1, wy] = wave
        px[wx + 2, wy + 1] = wave
        px[wx + 3, wy] = foam
    if shore_edges:
        rock_dk = (68, 72, 82, 255)
        rock_lt = (188, 192, 198, 255)
        sand_sh = (224, 212, 182, 255)
        for y in range(16):
            for x in range(16):
                d = 99
                if "N" in shore_edges:
                    d = min(d, y)
                if "S" in shore_edges:
                    d = min(d, 15 - y)
                if "W" in shore_edges:
                    d = min(d, x)
                if "E" in shore_edges:
                    d = min(d, 15 - x)
                if d == 0:
                    px[x, y] = rock_dk if (x + y) % 3 == 0 else sand_sh
                elif d == 1:
                    px[x, y] = rock_lt if (x + y) % 2 == 0 else sand_sh
                elif d == 2 and (x + y) % 2 == 0:
                    px[x, y] = wave


def _draw_counter_tile(px) -> None:
    dark = (22, 14, 10, 255)
    rim = (232, 142, 38, 255)
    green = (44, 192, 36, 255)
    wood = (242, 156, 48, 255)
    wood_hi = (252, 178, 72, 255)
    for y in range(16):
        for x in range(16):
            if x in (0, 15) or y in (0, 15):
                px[x, y] = dark
            elif x in (1, 14) or y in (1, 14):
                px[x, y] = rim
            elif x in (2, 13) or y in (2, 13):
                px[x, y] = green
            elif x == 3 or y == 3:
                px[x, y] = wood_hi
            else:
                px[x, y] = wood
    px[8, 8] = wood


def _draw_door_tile(px) -> None:
    _draw_brick_tile(px)
    dark = (20, 20, 26, 255)
    arch_lt = (208, 212, 222, 255)
    arch_md = (164, 168, 178, 255)
    arch_dk = (112, 116, 126, 255)
    panel_red = (208, 48, 30, 255)
    for y in range(1, 16):
        for x in range(1, 15):
            if y == 1 and x in (1, 2, 13, 14):
                continue
            if y == 2 and x in (1, 14):
                continue
            # Outer arch border
            if x in (1, 14) or (y == 1 and 3 <= x <= 12) or (y == 2 and x in (2, 13)) or y == 15:
                px[x, y] = dark
            elif x in (2, 13) or y == 2 or y == 14:
                px[x, y] = arch_lt if (x == 2 or y == 2) else arch_md
            elif x == 7:
                px[x, y] = dark
            elif x == 8:
                px[x, y] = arch_lt
            elif y == 9:
                px[x, y] = arch_md
            elif 3 <= y <= 8:
                px[x, y] = arch_dk if x in (4, 11) else dark
            else:
                # Lower red door panels (y = 10..13)
                px[x, y] = dark if (x in (4, 11) and y == 11) else panel_red
    px[8, 8] = arch_lt


def _draw_weapon_sign_tile(px) -> None:
    _draw_brick_tile(px)
    dark = (18, 18, 24, 255)
    frame_lt = (196, 200, 210, 255)
    frame_dk = (120, 124, 136, 255)
    bg = (28, 30, 38, 255)
    blade = (240, 244, 252, 255)
    hilt = (216, 56, 32, 255)
    gold = (248, 196, 52, 255)
    for y in range(1, 15):
        for x in range(1, 15):
            dist = max(abs(x - 7.5), abs(y - 7.5))
            manhattan = abs(x - 7.5) + abs(y - 7.5)
            if manhattan >= 11.5:
                px[x, y] = dark
            elif dist >= 5.5 or manhattan >= 9.5:
                px[x, y] = frame_lt if (x + y < 15) else frame_dk
            else:
                px[x, y] = bg
    # Diagonal sword (bottom-left hilt to top-right tip)
    for i in range(3, 13):
        bx, by = i, 15 - i
        if i >= 6:
            px[bx, by] = blade
            px[bx - 1, by] = frame_lt
        else:
            px[bx, by] = hilt
    # Crossguard
    for gx, gy in [(4, 9), (5, 10), (6, 11), (7, 11)]:
        px[gx, gy] = gold
    px[3, 12] = gold


def _draw_inn_sign_tile(px) -> None:
    _draw_brick_tile(px)
    dark = (20, 16, 16, 255)
    border = (208, 52, 30, 255)
    parchment = (240, 232, 216, 255)
    # Hanging chains at y=2..3
    for x in range(1, 15):
        px[x, 3] = dark
    px[4, 2] = (188, 192, 202, 255)
    px[11, 2] = (188, 192, 202, 255)
    for y in range(4, 15):
        for x in range(1, 15):
            if x in (1, 14) or y in (4, 14):
                px[x, y] = border
            else:
                px[x, y] = parchment
    for x in range(1, 15):
        px[x, 15] = dark
    # Pixel-art "INN" lettering (y=6..12)
    for y in range(6, 13):
        px[3, y] = dark   # I
        px[5, y] = dark   # N1 left
        px[8, y] = dark   # N1 right
        px[10, y] = dark  # N2 left
        px[13, y] = dark  # N2 right
    for dx, dy in [(6, 7), (6, 8), (7, 9), (7, 10), (11, 7), (11, 8), (12, 9), (12, 10)]:
        px[dx, dy] = dark


def _draw_bridge_tile(px) -> None:
    _draw_water_tile(px)
    dark = (18, 22, 32, 255)
    rail_top = (84, 118, 184, 255)
    deck_hi = (212, 218, 228, 255)
    deck_md = (176, 182, 194, 255)
    deck_lo = (132, 138, 150, 255)
    rail_bot = (244, 248, 255, 255)
    for x in range(16):
        dy = 0 if 4 <= x <= 11 else (1 if x in (2, 3, 12, 13) else 2)
        # Upper arch railing
        px[x, 1 + dy] = dark
        px[x, 2 + dy] = rail_top if x % 2 == 1 else dark
        px[x, 3 + dy] = rail_top if x % 2 == 1 else dark
        px[x, 4 + dy] = dark
        # Stone bridge deck
        for y in range(5 + dy, 10 + dy):
            if x in (0, 4, 8, 12, 15) and (x, y) != (8, 8):
                px[x, y] = deck_lo
            elif y in (6 + dy, 7 + dy):
                px[x, y] = deck_hi
            else:
                px[x, y] = deck_md
        # Lower sunlit arch railing
        px[x, 10 + dy] = rail_bot
        px[x, 11 + dy] = rail_bot if x % 2 == 1 else dark
        px[x, 12 + dy] = rail_bot if x % 2 == 1 else dark
        if 13 + dy < 16:
            px[x, 13 + dy] = dark
    px[8, 8] = deck_hi


def _draw_chest_tile(px) -> None:
    _draw_brick_tile(px)
    dark = (20, 14, 14, 255)
    silver = (238, 242, 250, 255)
    silver_sh = (168, 174, 188, 255)
    red = (216, 48, 30, 255)
    red_hi = (244, 84, 56, 255)
    gold = (252, 212, 64, 255)
    for y in range(2, 15):
        for x in range(2, 14):
            if y == 2 and x in (2, 13):
                continue
            if x in (2, 13) or y in (2, 14) or (y == 3 and x in (3, 12)):
                px[x, y] = dark
            elif y in (3, 7, 8, 13) or x in (3, 12):
                px[x, y] = silver if (y <= 7 or x == 3) else silver_sh
            elif y < 7:
                px[x, y] = red_hi if y == 4 else red
            else:
                px[x, y] = red
    # Central lock plate
    for y in range(6, 11):
        for x in range(6, 10):
            if x in (7, 8) and y in (7, 9):
                px[x, y] = dark
            else:
                px[x, y] = gold
    px[8, 8] = gold


def _draw_barrier_tile(px) -> None:
    palette = [
        (244, 252, 255, 255),
        (232, 248, 255, 255),
        (56, 184, 252, 255),
        (24, 68, 196, 255),
        (20, 52, 168, 255),
        (48, 196, 64, 255),
        (192, 242, 44, 255),
        (148, 224, 36, 255),
    ]
    for y in range(16):
        for x in range(16):
            px[x, y] = palette[(x + y) % 8]
    px[8, 8] = palette[0]


def _draw_swamp_tile(px, walkable: bool = False) -> None:
    bog = (12, 20, 10, 255)
    marsh_md = (56, 176, 20, 255)
    marsh_hi = (112, 220, 36, 255)
    for y in range(16):
        for x in range(16):
            if y % 2 == 0 and (x + (y // 2) * 3) % 5 in (0, 1):
                px[x, y] = marsh_hi if (x + y) % 3 == 0 else marsh_md
            elif y % 2 == 1 and (x + (y // 2) * 3) % 7 == 2:
                px[x, y] = marsh_md
            else:
                px[x, y] = bog
    if walkable:
        px[8, 8] = marsh_hi


def _draw_stair_tile(px, brick_header: bool = True) -> None:
    pit = (16, 16, 22, 255)
    step_hi = (212, 216, 226, 255)
    step_face = (168, 172, 182, 255)
    step_sh = (124, 128, 138, 255)
    for y in range(16):
        for x in range(16):
            px[x, y] = pit

    if brick_header:
        # Tile 33: 3px terracotta brick top header + 4 solid stone steps descending L->R
        _draw_brick_tile(px)
        for y in range(3, 16):
            for x in range(16):
                px[x, y] = pit
        steps = [(0, 3, 5), (4, 7, 7), (8, 11, 9), (12, 15, 11)]
        for sx0, sx1, sy0 in steps:
            for y in range(sy0, 15):
                for x in range(sx0, sx1 + 1):
                    if x == sx1 or x == 0:
                        px[x, y] = pit
                    elif y == sy0 or x == sx0:
                        px[x, y] = step_hi
                    elif x == sx1 - 1:
                        px[x, y] = step_sh
                    else:
                        px[x, y] = step_face
        # Ensure (8, 8) is part of the step top tread so center luminance > 0.05
        for x in range(8, 11):
            px[x, 8] = step_hi
    else:
        # Tile 34 & 69: 4 diagonal stone steps descending L->R with dark bottom-left & top-right triangles
        steps = [(0, 3, 1, 9), (4, 7, 3, 11), (8, 11, 5, 13), (12, 15, 7, 15)]
        for sx0, sx1, sy0, sy1 in steps:
            for y in range(sy0, sy1 + 1):
                for x in range(sx0, sx1 + 1):
                    if x == sx1:
                        px[x, y] = pit
                    elif y == sy0 or (x == sx0 and sx0 > 0):
                        px[x, y] = step_hi
                    elif x == sx1 - 1:
                        px[x, y] = step_sh
                    else:
                        px[x, y] = step_face
    px[8, 8] = step_face


def _draw_parapet_tile(px) -> None:
    dark = (18, 20, 26, 255)
    stone_lt = (186, 190, 198, 255)
    stone_md = (152, 156, 166, 255)
    boss = (104, 108, 118, 255)
    for by0 in (0, 8):
        for bx0 in (0, 8):
            for ly in range(8):
                for lx in range(8):
                    x, y = bx0 + lx, by0 + ly
                    if ly == 7 or (ly in (0, 1) and lx in (3, 4)) or (ly == 6 and lx in (0, 3, 4, 7)):
                        px[x, y] = dark
                    elif 2 <= ly <= 5 and lx in (3, 4):
                        px[x, y] = boss
                    elif 3 <= ly <= 4 and lx in (2, 5):
                        px[x, y] = boss
                    elif lx in (0, 5) or ly == 0:
                        px[x, y] = stone_lt
                    else:
                        px[x, y] = stone_md


def draw_tile_16x16(
    tid: int,
    label: str,
    avg_rgb: list[int],
    walkable: bool,
    include_npc: bool = False,
) -> Image.Image:
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 255))
    px = img.load()

    # Check if this is one of the 37 NPC-baked tiles
    if tid in NPC_TILE_SPECS:
        bg_tid, role, facing = NPC_TILE_SPECS[tid]
        bg_im = draw_tile_16x16(bg_tid, label, avg_rgb, walkable, include_npc=False)
        if include_npc and "_draw_char_16x16" in globals():
            npc_im = _draw_char_16x16(role, facing, 0)
            bg_im.alpha_composite(npc_im)
        return bg_im

    if tid in (0, 52, 54, 58):
        _draw_grass_tile(px, tid)
    elif tid in (1, 22, 24, 36, 37, 40, 50, 61, 63):
        _draw_stone_block_tile(px, water_top=(tid == 36))
    elif tid in (2, 42, 43, 44, 49, 56, 68):
        _draw_sand_tile(px, tid)
    elif tid in (3, 38, 39, 62):
        _draw_brick_tile(px)
    elif tid == 4:
        _draw_trees_tile(px)
    elif tid in (6, 35, 41, 45, 51, 57, 70, 71):
        _draw_water_tile(px)
    elif tid in (8, 64, 66):
        _draw_counter_tile(px)
    elif tid in (10, 47):
        _draw_door_tile(px)
    elif tid == 12:
        _draw_weapon_sign_tile(px)
    elif tid == 16:
        _draw_inn_sign_tile(px)
    elif tid in (18, 48):
        _draw_bridge_tile(px)
    elif tid in (30, 46):
        _draw_chest_tile(px)
    elif tid == 31:
        _draw_barrier_tile(px)
    elif tid in (32, 53, 55, 59, 60, 67):
        _draw_swamp_tile(px, walkable=walkable)
    elif tid in (33, 34, 69):
        _draw_stair_tile(px, brick_header=(tid == 33))
    elif tid == 90:
        _draw_parapet_tile(px)
    elif label == "water":
        _draw_water_tile(px)
    elif label == "forest":
        _draw_trees_tile(px)
    elif label == "grass":
        _draw_grass_tile(px, tid)
    elif label == "dirt":
        _draw_sand_tile(px, tid)
    else:
        _draw_stone_block_tile(px)

    if walkable:
        cr, cg, cb, _ = px[8, 8]
        if (cr * 0.2126 + cg * 0.7152 + cb * 0.0722) < 28:
            px[8, 8] = (148, 152, 164, 255)
    return img


def generate_tiles_and_maps() -> dict[int, Image.Image]:
    tiles_meta = json.loads((DATA_DIR / "tiles_meta.json").read_text(encoding="utf-8"))["tiles"]
    walkable_ids = set(json.loads((DATA_DIR / "tile_walkability.json").read_text(encoding="utf-8"))["walkable"])
    map_grids = json.loads((DATA_DIR / "map_grids.json").read_text(encoding="utf-8"))["maps"]

    tiles_dir = ASSETS_DIR / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    # Map-clean tiles (no baked NPCs on floor) vs individual tile files (with NPCs for tile catalog parity)
    map_tile_imgs: dict[int, Image.Image] = {}
    tile_imgs: dict[int, Image.Image] = {}

    # Optional: extract mini-map tiles 92..361 from generated world-map.png if present
    world_sheet_path = ASSETS_DIR / "maps" / "world-map.png"
    world_sheet = Image.open(world_sheet_path).convert("RGBA") if world_sheet_path.exists() else None
    world_grid = map_grids.get("world-map", {}).get("grid", [])
    world_tile_coords: dict[int, tuple[int, int]] = {}
    for wry, wrow in enumerate(world_grid):
        for wrx, wtid in enumerate(wrow):
            if int(wtid) >= 92 and int(wtid) not in world_tile_coords:
                world_tile_coords[int(wtid)] = (wrx, wry)

    for t in tiles_meta:
        tid = int(t["id"])
        label = str(t.get("auto_label", "stone"))
        avg_rgb = t.get("avg_rgb", [120, 120, 120])
        is_walk = tid in walkable_ids
        if tid >= 92 and world_sheet is not None and tid in world_tile_coords:
            wx, wy = world_tile_coords[tid]
            im_clean = world_sheet.crop((wx * 16, wy * 16, wx * 16 + 16, wy * 16 + 16))
            im_cat = im_clean.copy()
        else:
            im_clean = draw_tile_16x16(tid, label, avg_rgb, is_walk, include_npc=False)
            im_cat = draw_tile_16x16(tid, label, avg_rgb, is_walk, include_npc=True)
        map_tile_imgs[tid] = im_clean
        tile_imgs[tid] = im_cat
        im_cat.save(tiles_dir / f"tile_{tid:03d}.png")

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

    maps_dir = ASSETS_DIR / "maps"
    grid_views_dir = maps_dir / "grid_views"
    renders_dir = ASSETS_DIR / "renders"
    maps_dir.mkdir(parents=True, exist_ok=True)
    grid_views_dir.mkdir(parents=True, exist_ok=True)
    renders_dir.mkdir(parents=True, exist_ok=True)

    default_floor = map_tile_imgs[3]

    for map_key, mdata in sorted(map_grids.items()):
        if map_key == "world-map":
            continue
        w_tiles = int(mdata["cols"])
        h_tiles = int(mdata["rows"])
        grid = mdata["grid"]
        map_img = Image.new("RGBA", (w_tiles * 16, h_tiles * 16), (20, 20, 28, 255))

        for ry in range(h_tiles):
            row = grid[ry] if ry < len(grid) else []
            for rx in range(w_tiles):
                tid = int(row[rx]) if rx < len(row) else 1
                t_im = map_tile_imgs.get(tid, default_floor)
                map_img.paste(t_im, (rx * 16, ry * 16))

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

def _draw_overworld_mountain_tile() -> Image.Image:
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    _draw_grass_tile(px, 0)
    dark = (18, 20, 24, 255)
    rock_hi = (206, 210, 218, 255)
    rock_md = (156, 160, 170, 255)
    rock_dk = (108, 112, 122, 255)
    # Twin jagged peaks (left peak at x=5, y=1; right peak at x=10, y=2)
    for y in range(1, 15):
        lx0 = max(1, 5 - (y - 1) // 2)
        lx1 = min(14, 10 + (y - 1) // 2)
        for x in range(lx0, lx1 + 1):
            if y == 1 and x not in (5,):
                continue
            if y == 2 and x not in (4, 5, 6, 10):
                continue
            if x in (lx0, lx1) or y == 14 or (x == 8 and y <= 6):
                px[x, y] = dark
            elif (x < 5 and y < 12) or (8 < x <= 10 and y < 11):
                px[x, y] = rock_hi
            elif x in (5, 11) or y >= 12:
                px[x, y] = rock_dk
            else:
                px[x, y] = rock_md
    # Crag ridge lines
    for cx, cy in [(4, 6), (5, 7), (6, 8), (3, 10), (9, 7), (10, 8), (11, 10), (7, 11), (8, 12)]:
        px[cx, cy] = dark
    return im


def _draw_overworld_hill_tile() -> Image.Image:
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    _draw_grass_tile(px, 0)
    dark = (16, 24, 10, 255)
    hill_hi = (196, 238, 52, 255)
    hill_md = (148, 212, 32, 255)
    hill_sh = (100, 172, 20, 255)
    # Conical ridged hill matching classic DW1 hills
    for y in range(4, 15):
        span = int((y - 3) * 0.65) + 1
        x0, x1 = max(1, 7 - span), min(14, 8 + span)
        for x in range(x0, x1 + 1):
            if x in (x0, x1) or (y == 4 and x in (7, 8)):
                px[x, y] = dark
            elif y == 14:
                px[x, y] = dark if x in (1, 2, 5, 6, 9, 10, 13, 14) else hill_md
            elif x <= 6:
                px[x, y] = hill_hi
            elif x <= 10:
                px[x, y] = hill_md
            else:
                px[x, y] = hill_sh
    # Radiating slope contour lines from summit
    for rx, ry in [
        (6, 5), (9, 5),
        (5, 8), (4, 9), (3, 11),
        (7, 8), (6, 10), (5, 12),
        (9, 8), (10, 10), (11, 12),
        (8, 11), (8, 13),
    ]:
        px[rx, ry] = dark
    return im


def _draw_overworld_castle_tile(is_charlock: bool = False) -> Image.Image:
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    _draw_grass_tile(px, 0)
    dark = (16, 18, 24, 255)
    wall_hi = (246, 250, 255, 255) if not is_charlock else (232, 224, 236, 255)
    wall_md = (184, 194, 212, 255) if not is_charlock else (172, 156, 180, 255)
    roof = (36, 120, 236, 255) if not is_charlock else (196, 48, 56, 255)
    for y in range(1, 15):
        for x in range(1, 15):
            if y <= 3:
                if (2 <= x <= 4) or (6 <= x <= 9) or (11 <= x <= 13):
                    px[x, y] = dark if (y == 1 and x in (2, 4, 6, 9, 11, 13)) else roof
            elif y <= 6:
                if x in (1, 14) or y == 6:
                    px[x, y] = dark
                elif x in (5, 10):
                    px[x, y] = dark if y >= 4 else px[x, y]
                else:
                    px[x, y] = wall_hi if x < 8 else wall_md
            else:
                if x in (1, 14) or y == 14:
                    px[x, y] = dark
                elif 6 <= x <= 9 and y >= 9:
                    px[x, y] = dark
                elif x in (3, 12) and y in (8, 9):
                    px[x, y] = dark
                else:
                    px[x, y] = wall_hi if x < 8 else wall_md
    return im


def _draw_overworld_town_tile() -> Image.Image:
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    _draw_grass_tile(px, 0)
    dark = (16, 18, 24, 255)
    wall = (244, 248, 255, 255)
    wall_sh = (184, 196, 210, 255)
    roof = (72, 168, 124, 255)
    # Multi-building town silhouette with left spire, center gable, right house
    for y in range(1, 15):
        for x in range(1, 15):
            if y <= 4 and 6 <= x <= 9:
                if y >= 1 + abs(x - 7):
                    px[x, y] = dark if x in (6, 9) else roof
            elif 3 <= y <= 6 and 2 <= x <= 5:
                if y >= 3 + abs(x - 3):
                    px[x, y] = dark if x in (2, 5) else roof
            elif y >= 5:
                if x in (1, 14) or y == 14 or (x == 5 and y <= 10) or (x == 10 and y <= 11):
                    px[x, y] = dark
                elif y == 5 and x >= 10:
                    px[x, y] = roof
                elif (x, y) in ((3, 8), (3, 9), (7, 7), (8, 7), (7, 11), (7, 12), (7, 13), (12, 9), (12, 10)):
                    px[x, y] = dark
                else:
                    px[x, y] = wall if x % 3 != 0 else wall_sh
    return im


def _draw_overworld_cave_tile() -> Image.Image:
    im = Image.new("RGBA", (16, 16))
    px = im.load()
    _draw_grass_tile(px, 0)
    dark = (14, 14, 20, 255)
    arch_lt = (212, 216, 226, 255)
    arch_dk = (132, 136, 148, 255)
    for y in range(2, 15):
        for x in range(2, 14):
            if y == 2 and x in (2, 3, 12, 13):
                continue
            if y == 3 and x in (2, 13):
                continue
            if x in (2, 13) or y == 2:
                px[x, y] = dark
            elif x in (3, 12) or y in (3, 14):
                px[x, y] = arch_lt if (x == 3 or y == 3) else arch_dk
            elif y == 12 and 5 <= x <= 10:
                px[x, y] = arch_dk
            else:
                px[x, y] = dark
    return im


def generate_overworld_map() -> None:
    terrain_path = ASSETS_DIR / "maps" / "worldmap_terrain.json"
    tdata = json.loads(terrain_path.read_text(encoding="utf-8"))
    n_tiles = int(tdata.get("tiles", 124))
    terrain = tdata["terrain"]

    # Build 16x16 terrain tiles for each terrain code (0..8)
    # 0=water, 1=forest, 2=bridge, 3=grass, 4=plains, 5=desert, 6=mountain, 7=swamp, 8=hills
    t_sprites: dict[int, Image.Image] = {
        0: draw_tile_16x16(6, "water", [32, 128, 240], False),
        1: draw_tile_16x16(4, "forest", [44, 148, 20], True),
        2: draw_tile_16x16(18, "bridge", [176, 182, 194], True),
        3: draw_tile_16x16(0, "grass", [116, 204, 20], True),
        4: draw_tile_16x16(0, "grass", [116, 204, 20], True),
        5: draw_tile_16x16(2, "dirt", [240, 210, 160], True),
        6: _draw_overworld_mountain_tile(),
        7: draw_tile_16x16(32, "dark", [24, 57, 3], True),
        8: _draw_overworld_hill_tile(),
    }

    # Pre-cache water shoreline variants for all 16 cardinal land-neighbor combinations
    water_shore_cache: dict[frozenset[str], Image.Image] = {}
    for mask in range(16):
        edges: set[str] = set()
        if mask & 1:
            edges.add("N")
        if mask & 2:
            edges.add("S")
        if mask & 4:
            edges.add("W")
        if mask & 8:
            edges.add("E")
        wim = Image.new("RGBA", (16, 16))
        _draw_water_tile(wim.load(), shore_edges=edges if edges else None)
        water_shore_cache[frozenset(edges)] = wim

    overworld = Image.new("RGBA", (n_tiles * 16, n_tiles * 16), (28, 124, 238, 255))
    for ry in range(min(n_tiles, len(terrain))):
        row = terrain[ry]
        for rx in range(min(n_tiles, len(row))):
            tcode = int(row[rx])
            if tcode == 0:
                edges_here: set[str] = set()
                if ry > 0 and int(terrain[ry - 1][rx]) not in (0, 2):
                    edges_here.add("N")
                if ry + 1 < n_tiles and int(terrain[ry + 1][rx]) not in (0, 2):
                    edges_here.add("S")
                if rx > 0 and int(terrain[ry][rx - 1]) not in (0, 2):
                    edges_here.add("W")
                if rx + 1 < n_tiles and int(terrain[ry][rx + 1]) not in (0, 2):
                    edges_here.add("E")
                overworld.paste(water_shore_cache[frozenset(edges_here)], (rx * 16, ry * 16))
            else:
                overworld.paste(t_sprites.get(tcode, t_sprites[3]), (rx * 16, ry * 16))

    # Draw Cantlin outer stone wall ring (15 tiles around (75, 104))
    stone_wall_tile = draw_tile_16x16(1, "stone", [168, 172, 180], False)
    cantlin_walls = [
        (73, 102), (74, 102), (76, 102), (77, 102),
        (73, 103), (77, 103),
        (73, 104), (77, 104),
        (73, 105), (77, 105),
        (73, 106), (74, 106), (75, 106), (76, 106), (77, 106),
    ]
    for wx, wy in cantlin_walls:
        overworld.paste(stone_wall_tile, (wx * 16, wy * 16))

    # Draw landmarks on overworld (Castles, Towns, Caves, Shrine Stairs)
    overworld.paste(_draw_overworld_castle_tile(is_charlock=False), (45 * 16, 45 * 16))
    overworld.paste(_draw_overworld_castle_tile(is_charlock=True), (50 * 16, 50 * 16))

    town_tile = _draw_overworld_town_tile()
    for tx, ty in [(50, 43), (4, 4), (106, 12), (104, 74), (75, 104), (27, 91)]:
        overworld.paste(town_tile, (tx * 16, ty * 16))

    cave_tile = _draw_overworld_cave_tile()
    for vx, vy in [(30, 14), (31, 59), (106, 46), (106, 51)]:
        overworld.paste(cave_tile, (vx * 16, vy * 16))

    shrine_stair_tile = draw_tile_16x16(33, "stone", [168, 172, 182], True)
    for sx, sy in [(83, 3), (110, 111)]:
        overworld.paste(shrine_stair_tile, (sx * 16, sy * 16))

    overworld.save(ASSETS_DIR / "maps" / "dw1-over2.png")
    preview = overworld.resize((640, 640), Image.Resampling.NEAREST)
    preview.save(ASSETS_DIR / "maps" / "world-map.png")
    preview.save(ASSETS_DIR / "images" / "world-map.png")
    preview.save(ASSETS_DIR / "maps" / "worldmap_terrain.png")



# ---------------------------------------------------------------------------
# 3. CHARACTER & NPC SPRITES (characters-3.png + 102 sliced NPC frames)
# ---------------------------------------------------------------------------

def _shade_rgba(col: tuple[int, int, int, int] | tuple[int, int, int], delta: int) -> tuple[int, int, int, int]:
    return (
        _clamp(col[0] + delta),
        _clamp(col[1] + delta),
        _clamp(col[2] + delta),
        col[3] if len(col) > 3 else 255,
    )


def _put(px, x: int, y: int, col: tuple[int, int, int, int]) -> None:
    if 0 <= x < 16 and 0 <= y < 16:
        px[x, y] = col


def _fill_rect(px, x0: int, y0: int, x1: int, y1: int, col: tuple[int, int, int, int]) -> None:
    for y in range(max(0, y0), min(16, y1 + 1)):
        for x in range(max(0, x0), min(16, x1 + 1)):
            px[x, y] = col


def _apply_pixel_outline(im: Image.Image, outline_col: tuple[int, int, int, int] = (18, 14, 26, 255)) -> Image.Image:
    """Add crisp 1px dark RPG outline on transparent neighbors of opaque pixels while keeping 16x16 bounds."""
    src = im.load()
    out = im.copy()
    dst = out.load()
    for y in range(16):
        for x in range(16):
            if src[x, y][3] > 0:
                continue
            # Check 4-connected neighbors
            has_opaque = False
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < 16 and 0 <= ny < 16 and src[nx, ny][3] > 200:
                    has_opaque = True
                    break
            if has_opaque:
                dst[x, y] = outline_col
    return out


def _draw_char_16x16(
    role: str,
    direction: str,
    step: int,
    has_sword: bool = False,
    has_shield: bool = False,
    with_princess: bool = False,
) -> Image.Image:
    """
    Hand-crafted 16x16 pixel-art character sprite generator with multi-tone shading,
    distinct silhouettes (helms, crowns, tiaras, robes, beards, hair, capes),
    expressive sclera+iris RPG eyes, swinging arms, alternating walk-stride boots,
    weapons, shields, and Hero+Princess carry pose.
    """
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = im.load()

    outline = (18, 14, 26, 255)
    white = (250, 252, 255, 255)
    gold_hi = (255, 236, 108, 255)
    gold_mid = (242, 194, 52, 255)
    gold_sh = (178, 126, 24, 255)
    steel_hi = (238, 244, 255, 255)
    steel_mid = (182, 196, 218, 255)
    steel_sh = (112, 124, 148, 255)
    ivory_hi = (252, 248, 232, 255)
    ivory_sh = (198, 186, 158, 255)

    # Role-specific palettes:
    # (garment_mid, skin_mid, trim_mid, boot_mid, hair_mid, cape_mid, eye_iris)
    role_palettes = {
        "hero": (
            (36, 114, 232, 255),   # royal sapphire armor/tunic
            (244, 198, 152, 255),  # warm hero skin
            (246, 202, 58, 255),   # gold trim / buckle
            (132, 72, 32, 255),    # leather boots & gauntlets
            (116, 64, 28, 255),    # chestnut hair
            (204, 38, 48, 255),    # crimson hero cape
            (24, 52, 128, 255),    # deep blue eyes
        ),
        "minister": (
            (126, 42, 176, 255),   # imperial amethyst robe
            (242, 198, 154, 255),  # skin
            (246, 206, 64, 255),   # golden chancellor stole
            (72, 26, 104, 255),    # dark violet shoes
            (176, 182, 196, 255),  # dignified silver-gray hair/beard
            (92, 28, 134, 255),    # deep purple mantle
            (36, 28, 52, 255),
        ),
        "lady": (
            (224, 64, 118, 255),   # rose-berry dress
            (250, 210, 170, 255),  # fair warm skin
            (248, 244, 236, 255),  # crisp white apron & collar
            (148, 38, 72, 255),    # slippers
            (168, 74, 32, 255),    # rich auburn hair
            (246, 198, 76, 255),   # gold ribbon
            (32, 76, 56, 255),     # emerald eyes
        ),
        "sage": (
            (226, 234, 246, 255),  # mystic ivory-silver robe
            (238, 194, 148, 255),  # skin
            (72, 178, 238, 255),   # sky-cyan mystic mantle & trim
            (118, 92, 64, 255),    # sandals/boots
            (246, 248, 255, 255),  # long snow-white wizard beard
            (52, 126, 196, 255),   # deep azure hood
            (28, 48, 88, 255),
        ),
        "sage_alt": (
            (42, 158, 78, 255),    # emerald merchant tunic
            (240, 196, 148, 255),  # skin
            (238, 188, 54, 255),   # gold trim & coin pouch
            (98, 56, 24, 255),     # leather boots
            (124, 72, 32, 255),    # brown beard
            (148, 86, 38, 255),    # brown velvet merchant vest
            (36, 28, 22, 255),
        ),
        "red_guard": (
            (212, 42, 46, 255),    # royal crimson plate armor
            (240, 196, 148, 255),  # skin
            (248, 206, 62, 255),   # gilded pauldrons & crest
            (124, 28, 32, 255),    # crimson greaves
            (92, 48, 24, 255),     # hair
            (168, 28, 36, 255),    # cape
            (28, 24, 36, 255),
        ),
        "guard": (
            (48, 108, 214, 255),   # castle cobalt surcoat
            (240, 196, 148, 255),  # skin
            (196, 208, 226, 255),  # polished steel helm & pauldrons
            (58, 72, 112, 255),    # steel/blue greaves
            (92, 56, 28, 255),     # hair
            (36, 78, 168, 255),    # deep blue cloak
            (28, 36, 64, 255),
        ),
        "trump_guard": (
            (58, 128, 228, 255),   # heraldic royal blue tunic
            (240, 196, 148, 255),  # skin
            (250, 212, 64, 255),   # golden trumpet & trim
            (52, 68, 118, 255),    # boots
            (92, 56, 28, 255),
            (214, 44, 52, 255),    # crimson trumpet banner
            (28, 36, 64, 255),
        ),
        "princess": (
            (244, 116, 172, 255),  # royal rose-pink gown
            (252, 216, 178, 255),  # porcelain-warm skin
            (252, 216, 68, 255),   # golden tiara & sash
            (208, 64, 124, 255),   # rose slippers
            (250, 204, 72, 255),   # flowing golden-blonde hair
            (252, 236, 244, 255),  # pearl-white lace & puffs
            (42, 92, 168, 255),    # sapphire eyes
        ),
        "dragonlord": (
            (96, 36, 156, 255),    # dark sorcerer violet robe
            (178, 214, 168, 255),  # eerie pale green-gray visage
            (238, 52, 58, 255),    # crimson-blood accents & eyes
            (42, 18, 68, 255),     # obsidian boots
            (54, 24, 88, 255),     # dark crown shadow
            (168, 28, 52, 255),    # crimson inner cape lining
            (255, 48, 48, 255),    # glowing red eyes
        ),
        "king": (
            (214, 38, 52, 255),    # royal scarlet velvet robe
            (242, 198, 152, 255),  # skin
            (250, 212, 58, 255),   # golden crown & chain of office
            (148, 28, 38, 255),    # royal shoes
            (248, 248, 252, 255),  # majestic white royal beard
            (246, 246, 252, 255),  # white ermine fur mantle
            (28, 42, 78, 255),
        ),
    }

    g_mid, skin_mid, trim_mid, boot_mid, hair_mid, cape_mid, eye_iris = role_palettes.get(
        role, role_palettes["guard"]
    )
    g_hi = _shade_rgba(g_mid, 28)
    g_sh = _shade_rgba(g_mid, -32)
    skin_hi = _shade_rgba(skin_mid, 18)
    skin_sh = _shade_rgba(skin_mid, -26)
    trim_hi = _shade_rgba(trim_mid, 26)
    trim_sh = _shade_rgba(trim_mid, -32)
    hair_hi = _shade_rgba(hair_mid, 24)
    hair_sh = _shade_rgba(hair_mid, -28)
    cape_hi = _shade_rgba(cape_mid, 22)
    cape_sh = _shade_rgba(cape_mid, -30)
    boot_hi = _shade_rgba(boot_mid, 22)
    boot_sh = _shade_rgba(boot_mid, -26)

    # Special case: Hero carrying Princess Gwaelin (row 4, cols 0..7)
    if role == "hero" and with_princess:
        # Draw Hero shifted 2px left so Princess Gwaelin is visibly cradled in his arms!
        base_hero = _draw_char_16x16("hero", direction, step, has_sword=True, has_shield=False, with_princess=False)
        im.paste(base_hero, (-2, 0))
        # Draw Princess Gwaelin in Hero's arms (x=8..14, y=3..12)
        p_dress = (244, 116, 172, 255)
        p_dress_hi = (255, 162, 204, 255)
        p_skin = (252, 216, 178, 255)
        p_hair = (250, 204, 72, 255)
        # Tiara & golden hair
        _put(px, 10, 3, gold_hi)
        _put(px, 11, 2, (248, 52, 92, 255))
        _put(px, 12, 3, gold_hi)
        for hx in range(9, 14):
            _put(px, hx, 4, p_hair)
        # Face or back of hair
        for fy in range(5, 8):
            for fx in range(9, 14):
                _put(px, fx, fy, p_hair if (direction == "up" or fx in (9, 13)) else p_skin)
        if direction != "up":
            _put(px, 10, 6, (42, 92, 168, 255))
            _put(px, 12, 6, (42, 92, 168, 255))
        # Cradled pink gown & gold sash
        for gy in range(8, 13):
            for gx in range(7, 14):
                if gy == 9:
                    _put(px, gx, gy, gold_mid)
                elif gx < 10:
                    _put(px, gx, gy, p_dress_hi)
                else:
                    _put(px, gx, gy, p_dress)
        return _apply_pixel_outline(im, outline)

    # Subtle vertical walk bob (0 on step 0, 0 on step 1 to keep crisp top, but arms/legs/cape animate!)
    bob = 0

    # -----------------------------------------------------------------------
    # A. BACK-LAYER CAPE / HAIR / ROBE AURA (before torso/head when facing down/side)
    # -----------------------------------------------------------------------
    if role in ("hero", "dragonlord", "king", "red_guard") and direction != "up":
        for cy in range(7, 13):
            if direction == "down":
                _put(px, 3, cy, cape_mid if cy < 11 else cape_sh)
                _put(px, 12, cy, cape_mid if cy < 11 else cape_sh)
            elif direction == "left":
                _put(px, 11, cy, cape_mid)
                _put(px, 12, cy + (step if cy < 12 else 0), cape_sh)
            elif direction == "right":
                _put(px, 4, cy, cape_mid)
                _put(px, 3, cy + (step if cy < 12 else 0), cape_sh)

    # -----------------------------------------------------------------------
    # B. LEGS, BOOTS & ROBE HEM (y=12..15) — Dynamic 2-Frame Walk Stride
    # -----------------------------------------------------------------------
    is_robed = role in ("minister", "sage", "princess", "dragonlord", "king", "lady")
    if is_robed:
        # Flared skirt / flowing robe hem (y=11..14) with animated feet peeking at y=14..15
        for ry in range(11, 14):
            w_pad = 1 if ry >= 12 else 0
            for rx in range(4 - w_pad, 12 + w_pad):
                if role == "lady" and 6 <= rx <= 9 and direction == "down":
                    _put(px, rx, ry, trim_mid if ry < 13 else trim_sh)  # White front apron
                elif role == "minister" and 7 <= rx <= 8 and direction == "down":
                    _put(px, rx, ry, gold_mid)  # Golden chancellor stole
                elif role == "king" and rx in (7, 8) and direction == "down":
                    _put(px, rx, ry, ivory_hi if (ry % 2 == 0) else outline)  # Ermine vertical trim
                elif ry == 13 and role in ("sage", "princess", "king", "dragonlord"):
                    _put(px, rx, ry, trim_mid)
                else:
                    _put(px, rx, ry, g_hi if rx < 7 else (g_mid if rx < 10 else g_sh))
        # Alternating feet under robe hem
        if step == 0:
            _fill_rect(px, 5, 14, 6, 14, boot_hi)
            _fill_rect(px, 9, 13, 10, 13, boot_sh)
        else:
            _fill_rect(px, 5, 13, 6, 13, boot_sh)
            _fill_rect(px, 9, 14, 10, 14, boot_hi)
    else:
        # Tunic/Armor legs & cuffed boots with distinct 2-frame stride
        if direction in ("down", "up"):
            l_max = 14 if step == 0 else 13
            r_max = 13 if step == 0 else 14
            for y in range(12, l_max + 1):
                col = boot_hi if (step == 0 and y == l_max) else boot_mid
                _put(px, 5, y, col)
                _put(px, 6, y, boot_sh if y < l_max else col)
            for y in range(12, r_max + 1):
                col = boot_hi if (step == 1 and y == r_max) else boot_mid
                _put(px, 9, y, col)
                _put(px, 10, y, boot_sh if y < r_max else col)
        else:
            # Side-profile stride: legs separate on step 0, pass close on step 1
            if step == 0:
                # Wide stride
                _fill_rect(px, 4, 12, 6, 14, boot_hi if direction == "left" else boot_sh)
                _fill_rect(px, 9, 12, 11, 14, boot_hi if direction == "right" else boot_sh)
            else:
                # Passing stride
                _fill_rect(px, 6, 12, 7, 14, boot_mid)
                _fill_rect(px, 8, 12, 9, 13, boot_sh)

    # -----------------------------------------------------------------------
    # C. TORSO, ARMOR, BELT & ARMS (y=7..11)
    # -----------------------------------------------------------------------
    for y in range(7, 12):
        for x in range(4, 12):
            # Base tunic/armor shading across chest
            col = g_hi if x < 7 else (g_mid if x < 10 else g_sh)

            if role == "hero":
                if y == 7 and x in (6, 7, 8, 9):
                    col = trim_mid  # Gold collar rim
                elif y == 10:
                    col = (112, 58, 22, 255)  # Leather belt
                    if x in (7, 8) and direction != "up":
                        col = gold_hi  # Gleaming belt buckle
                elif has_sword and has_shield and y in (8, 9) and x in (7, 8) and direction == "down":
                    col = gold_mid  # Erdrick chest emblem

            elif role in ("guard", "red_guard", "trump_guard"):
                if y in (7, 8) and x in (4, 5, 10, 11):
                    col = trim_hi if x < 8 else trim_mid  # Metal pauldrons
                elif y == 10:
                    col = trim_sh if x not in (7, 8) else gold_hi
                elif y == 8 and x in (7, 8) and direction == "down":
                    col = trim_hi  # Breastplate crest

            elif role == "king":
                if y in (7, 8):
                    # White ermine royal shoulder mantle with black spots
                    col = ivory_hi if ((x + y) % 3 != 0) else outline
                elif x in (7, 8) and direction == "down":
                    col = gold_hi  # Golden royal chain / sash

            elif role == "minister":
                if x in (7, 8) and direction == "down":
                    col = gold_hi if y % 2 == 0 else gold_mid  # Chancellor stole

            elif role == "sage":
                if y == 7 or x in (5, 10):
                    col = trim_mid  # Sky-cyan mystic robe trim
                elif y == 10:
                    col = gold_mid

            elif role == "sage_alt":
                # Merchant brown velvet vest over green tunic + gold coin pouch
                if x in (4, 5, 10, 11) and direction == "down":
                    col = cape_mid
                elif y == 10:
                    col = (88, 48, 18, 255)
                if y in (10, 11) and x in (9, 10) and direction != "up":
                    col = gold_hi  # Fat gold coin pouch at belt

            elif role == "lady":
                if y == 7 and x in (6, 7, 8, 9):
                    col = white  # White blouse neckline
                elif y in (8, 9) and x in (7, 8) and direction == "down":
                    col = gold_mid  # Laced bodice

            elif role == "princess":
                if y == 7 and x in (5, 6, 7, 8, 9, 10):
                    col = cape_mid  # Pearl-white lace collar
                elif y == 10:
                    col = gold_hi  # Golden royal waist sash

            elif role == "dragonlord":
                if y in (7, 8) and x in (4, 5, 10, 11):
                    col = cape_mid  # Crimson bat-wing collar
                elif x in (7, 8) and direction == "down":
                    col = gold_mid if y == 8 else cape_mid

            _put(px, x, y, col)

    # When facing UP, draw full back cape / hair / hood details over torso
    if direction == "up":
        if role in ("hero", "king", "dragonlord", "red_guard"):
            for y in range(7, 13):
                for x in range(4, 12):
                    c = cape_hi if x in (5, 8) else (cape_sh if x in (4, 7, 11) else cape_mid)
                    if role == "king" and y in (7, 8):
                        c = ivory_hi if (x + y) % 3 != 0 else outline
                    _put(px, x, y, c)
        elif role == "princess":
            for y in range(6, 11):
                for x in range(5, 11):
                    _put(px, x, y, hair_hi if x % 2 == 0 else hair_mid)

    # Swinging arms & hands / gauntlets (x=2..3 and x=12..13, y=7..11)
    arm_l_dy = 1 if step == 0 else 0
    arm_r_dy = 0 if step == 0 else 1
    sleeve_col = (
        cape_mid if role == "princess"
        else (white if role == "lady" else (trim_mid if role in ("guard", "red_guard") else g_mid))
    )
    hand_col = boot_mid if role in ("hero", "guard", "red_guard") else skin_mid

    if direction in ("down", "up"):
        for ay in range(7, 10):
            _put(px, 3, ay + arm_l_dy, sleeve_col)
            _put(px, 12, ay + arm_r_dy, _shade_rgba(sleeve_col, -18))
        _put(px, 3, 10 + arm_l_dy, hand_col)
        _put(px, 12, 10 + arm_r_dy, hand_col)
    elif direction == "left":
        ax = 6 if step == 0 else 8
        _fill_rect(px, ax, 8, ax + 1, 9, sleeve_col)
        _put(px, ax, 10, hand_col)
    elif direction == "right":
        ax = 8 if step == 0 else 6
        _fill_rect(px, ax, 8, ax + 1, 9, sleeve_col)
        _put(px, ax + 1, 10, hand_col)

    # -----------------------------------------------------------------------
    # D. HEAD, FACE, EYES, BEARDS & ICONIC HEADGEAR (y=0..7)
    # -----------------------------------------------------------------------
    # Rounded head base (y=2..6, x=4..11; y=1, x=5..10)
    for y in range(1, 7):
        x0 = 5 if y in (1, 6) else 4
        x1 = 10 if y in (1, 6) else 11
        for x in range(x0, x1 + 1):
            if direction == "up":
                _put(px, x, y, hair_mid if (x + y) % 2 == 0 else hair_sh)
            else:
                s_col = skin_hi if (y <= 3 and x < 9) else (skin_mid if x < 10 else skin_sh)
                _put(px, x, y, s_col)

    # Expressive RPG Eyes (2px tall: white sclera at y=4, dark iris at y=5) + Nose/Mouth
    if direction == "down":
        if role == "dragonlord":
            _put(px, 6, 4, (255, 220, 80, 255))
            _put(px, 6, 5, (255, 36, 36, 255))
            _put(px, 9, 4, (255, 220, 80, 255))
            _put(px, 9, 5, (255, 36, 36, 255))
        else:
            _put(px, 5, 4, white)
            _put(px, 5, 5, eye_iris)
            _put(px, 10, 4, white)
            _put(px, 10, 5, eye_iris)
            # Subtle blush or cheek shading
            if role in ("princess", "lady"):
                _put(px, 4, 5, (248, 152, 164, 255))
                _put(px, 11, 5, (248, 152, 164, 255))
    elif direction == "left":
        eye_c = (255, 42, 42, 255) if role == "dragonlord" else eye_iris
        _put(px, 5, 4, white if role != "dragonlord" else (255, 210, 64, 255))
        _put(px, 5, 5, eye_c)
        # Hair / helmet back on right side of head
        for y in range(2, 7):
            for x in range(8, 12):
                _put(px, x, y, hair_mid if y < 5 else hair_sh)
    elif direction == "right":
        eye_c = (255, 42, 42, 255) if role == "dragonlord" else eye_iris
        _put(px, 10, 4, white if role != "dragonlord" else (255, 210, 64, 255))
        _put(px, 10, 5, eye_c)
        # Hair / helmet back on left side of head
        for y in range(2, 7):
            for x in range(4, 8):
                _put(px, x, y, hair_mid if y < 5 else hair_sh)

    # Role-Specific Headgear, Crowns, Helmets, Hair & Beards
    if role == "hero":
        # Iconic Erdrick Winged/Horned Battle Helm
        for y in range(1, 4):
            for x in range(4, 12):
                if y == 1 and x in (4, 11):
                    continue
                _put(px, x, y, g_hi if y == 1 else (steel_hi if y == 3 else g_mid))
        # Gold brow crest & nasal guard
        _put(px, 7, 2, gold_hi)
        _put(px, 8, 2, gold_hi)
        if direction == "down":
            _put(px, 7, 3, gold_mid)
            _put(px, 8, 3, gold_mid)
            # Helmet cheekguards
            _put(px, 4, 4, steel_mid)
            _put(px, 4, 5, steel_sh)
            _put(px, 11, 4, steel_mid)
            _put(px, 11, 5, steel_sh)
        elif direction == "up":
            for y in range(1, 6):
                for x in range(4, 12):
                    if y == 1 and x in (4, 11):
                        continue
                    _put(px, x, y, steel_mid if y == 5 else (g_hi if x in (6, 9) else g_mid))
        # Sweeping Curved Ivory Horns (left & right)
        for hx, hy, col in [
            (3, 3, ivory_sh), (2, 2, ivory_hi), (1, 1, white), (2, 3, ivory_sh),
            (12, 3, ivory_sh), (13, 2, ivory_hi), (14, 1, white), (13, 3, ivory_sh),
        ]:
            _put(px, hx, hy, col)

    elif role == "king":
        # 3-Spiked Golden Royal Crown with Ruby & Emerald Jewels
        for x in range(4, 12):
            _put(px, x, 2, gold_mid)
            _put(px, x, 3, gold_sh)
        for sx in (4, 7, 8, 11):
            _put(px, sx, 0, gold_hi)
            _put(px, sx, 1, gold_hi)
        _put(px, 5, 1, gold_mid)
        _put(px, 10, 1, gold_mid)
        _put(px, 7, 2, (248, 38, 52, 255))  # Center ruby
        _put(px, 8, 2, (248, 38, 52, 255))
        _put(px, 5, 2, (48, 214, 96, 255))  # Side emeralds
        _put(px, 10, 2, (48, 214, 96, 255))
        # Flowing White Kingly Beard (when facing down/side)
        if direction != "up":
            for by in range(6, 10):
                bx0 = 5 if by < 9 else 6
                bx1 = 10 if by < 9 else 9
                for bx in range(bx0, bx1 + 1):
                    _put(px, bx, by, white if (bx + by) % 2 == 0 else (210, 218, 232, 255))

    elif role == "princess":
        # Golden Royal Tiara + Long Wavy Blonde Hair
        for x in range(5, 11):
            _put(px, x, 1, gold_hi if x in (7, 8) else gold_mid)
        _put(px, 7, 0, gold_hi)
        _put(px, 8, 0, gold_hi)
        _put(px, 7, 1, (248, 52, 108, 255))  # Ruby tiara gem
        _put(px, 8, 1, (248, 52, 108, 255))
        for x in range(4, 12):
            _put(px, x, 2, hair_hi if x % 2 == 0 else hair_mid)
        # Side hair locks framing face
        if direction != "up":
            for hy in range(3, 9):
                _put(px, 3, hy, hair_mid)
                _put(px, 4, hy, hair_hi if hy < 6 else hair_mid)
                _put(px, 11, hy, hair_hi if hy < 6 else hair_mid)
                _put(px, 12, hy, hair_sh)

    elif role == "dragonlord":
        # Horned Obsidian & Gold Sorcerer Crown + High Bat-Wing Collar
        for x in range(4, 12):
            _put(px, x, 1, (48, 24, 78, 255))
            _put(px, x, 2, gold_mid if x in (7, 8) else (36, 18, 58, 255))
        _put(px, 7, 2, (255, 42, 42, 255))  # Blood gem
        _put(px, 8, 2, (255, 42, 42, 255))
        # Sweeping dark-gold dragon horns
        for hx, hy in [(3, 2), (2, 1), (1, 0), (12, 2), (13, 1), (14, 0)]:
            _put(px, hx, hy, gold_hi if hy == 0 else gold_sh)
        # High flared collar on sides of head
        _put(px, 3, 5, cape_mid)
        _put(px, 3, 6, cape_mid)
        _put(px, 12, 5, cape_mid)
        _put(px, 12, 6, cape_mid)

    elif role == "minister":
        # Tall Ceremonial Purple & Gold Mitre Hat
        _fill_rect(px, 5, 0, 10, 1, g_hi)
        _fill_rect(px, 4, 2, 11, 3, g_mid)
        for x in range(4, 12):
            _put(px, x, 3, gold_mid)
        _put(px, 7, 1, gold_hi)
        _put(px, 8, 1, gold_hi)
        if direction == "down":
            _put(px, 7, 6, hair_mid)
            _put(px, 8, 6, hair_mid)

    elif role == "sage":
        # Mystic Hood / Scholar Cap + Long Flowing White Beard
        _fill_rect(px, 5, 0, 10, 1, cape_hi)
        _fill_rect(px, 4, 1, 11, 2, cape_mid)
        for x in range(4, 12):
            _put(px, x, 3, white if x in (5, 6, 9, 10) else cape_sh)  # Bushy white eyebrows
        if direction != "up":
            for by in range(6, 11):
                bx0 = 5 if by < 9 else (6 if by == 9 else 7)
                bx1 = 10 if by < 9 else (9 if by == 9 else 8)
                for bx in range(bx0, bx1 + 1):
                    _put(px, bx, by, white if (bx + by) % 2 == 0 else (206, 216, 232, 255))

    elif role == "sage_alt":
        # Plumed Emerald Merchant Beret/Turban + Brown Beard
        _fill_rect(px, 4, 1, 11, 2, g_hi)
        _fill_rect(px, 3, 2, 12, 3, g_mid)
        _put(px, 7, 2, gold_hi)
        _put(px, 8, 2, gold_hi)
        # Jaunty white feather plume
        _put(px, 10, 0, white)
        _put(px, 11, 0, white)
        _put(px, 11, 1, ivory_sh)
        if direction != "up":
            for bx in range(5, 11):
                _put(px, bx, 6, hair_mid)
            for bx in range(6, 10):
                _put(px, bx, 7, hair_sh)

    elif role == "lady":
        # Flowing Auburn Hair + Gold Ribbon
        _fill_rect(px, 5, 1, 10, 2, hair_hi)
        for x in range(4, 12):
            _put(px, x, 2, gold_hi if x in (6, 7, 8, 9) else hair_mid)
            _put(px, x, 3, hair_mid)
        if direction != "up":
            for hy in range(3, 8):
                _put(px, 3, hy, hair_sh)
                _put(px, 4, hy, hair_mid)
                _put(px, 11, hy, hair_mid)
                _put(px, 12, hy, hair_sh)

    elif role in ("guard", "trump_guard"):
        # Polished Steel Kettle/Nasal Knight Helm with Blue Plume
        _put(px, 7, 0, g_hi)
        _put(px, 8, 0, g_hi)
        _fill_rect(px, 5, 1, 10, 1, steel_hi)
        _fill_rect(px, 4, 2, 11, 3, steel_mid)
        for x in range(3, 13):
            _put(px, x, 3, steel_hi if x in (6, 7, 8, 9) else steel_sh)
        if direction == "down":
            _put(px, 4, 4, steel_sh)
            _put(px, 4, 5, steel_sh)
            _put(px, 11, 4, steel_sh)
            _put(px, 11, 5, steel_sh)

    elif role == "red_guard":
        # Golden-Plumed Crimson Great-Helm
        _put(px, 7, 0, gold_hi)
        _put(px, 8, 0, gold_hi)
        _put(px, 9, 0, gold_mid)
        _fill_rect(px, 5, 1, 10, 1, g_hi)
        _fill_rect(px, 4, 2, 11, 3, g_mid)
        for x in range(4, 12):
            _put(px, x, 3, gold_hi if x in (6, 7, 8, 9) else gold_mid)
        if direction == "down":
            _put(px, 4, 4, g_sh)
            _put(px, 4, 5, g_sh)
            _put(px, 11, 4, g_sh)
            _put(px, 11, 5, g_sh)

    # -----------------------------------------------------------------------
    # E. WEAPONS, SHIELDS, STAVES, SCROLLS & TRUMPET
    # -----------------------------------------------------------------------
    if role == "trump_guard":
        # Left-facing Golden Royal Fanfare Trumpet + Crimson/Gold Banner
        for tx in range(0, 6):
            _put(px, tx, 5, gold_hi)
        _put(px, 0, 4, gold_hi)
        _put(px, 0, 6, gold_mid)
        _put(px, 1, 4, gold_mid)
        _put(px, 1, 6, gold_mid)
        # Hanging crimson banner with gold cross
        for by in range(6, 10):
            for bx in range(1, 4):
                _put(px, bx, by, gold_hi if (bx == 2 or by == 9) else cape_mid)

    elif role == "king":
        # Royal Golden Orb Scepter in right hand (x=2, y=3..13)
        for sy in range(5, 14):
            _put(px, 2, sy, gold_mid if sy % 2 == 0 else gold_sh)
        _put(px, 2, 3, (255, 48, 64, 255))
        _put(px, 1, 4, gold_hi)
        _put(px, 2, 4, gold_hi)
        _put(px, 3, 4, gold_hi)

    elif role == "sage":
        # Gnarled Oak Staff with Glowing Cyan Crystal (x=2, y=2..14)
        sx = 2 if direction != "right" else 13
        for sy in range(4, 15):
            _put(px, sx, sy, (148, 92, 42, 255) if sy % 2 == 0 else (112, 68, 28, 255))
        _put(px, sx, 2, (140, 244, 255, 255))
        _put(px, sx, 3, (56, 196, 248, 255))
        _put(px, max(0, sx - 1), 3, (140, 244, 255, 255))

    elif role == "dragonlord":
        # Dragonlord's Blazing Orb Staff
        sx = 2 if direction != "right" else 13
        for sy in range(4, 15):
            _put(px, sx, sy, gold_sh if sy % 2 == 0 else (64, 28, 92, 255))
        _put(px, sx, 2, (255, 72, 52, 255))
        _put(px, sx, 3, gold_hi)
        _put(px, max(0, sx - 1), 2, (255, 180, 64, 255))
        _put(px, min(15, sx + 1), 2, (255, 180, 64, 255))

    elif role == "minister" and direction != "up":
        # Rolled Parchment Royal Scroll with Red Seal
        _fill_rect(px, 2, 8, 3, 10, ivory_hi)
        _put(px, 2, 9, (228, 42, 42, 255))

    elif role in ("guard", "red_guard"):
        # Upright Steel/Gold Spear/Halberd on weapon side
        sx = 2 if direction != "right" else 13
        for sy in range(3, 15):
            _put(px, sx, sy, (132, 78, 36, 255))
        # Spearhead / Halberd blade
        tip_col = gold_hi if role == "red_guard" else steel_hi
        _put(px, sx, 0, white)
        _put(px, sx, 1, tip_col)
        _put(px, sx, 2, tip_col)
        _put(px, max(0, sx - 1), 2, tip_col)

    # Hero / Guard Sword
    if has_sword and role == "hero":
        sx = 2 if direction != "right" else 13
        s_dy = 0 if step == 0 else 1
        # Gleaming 2px-wide broadsword blade + golden crossguard + ruby pommel
        for sy in range(2 + s_dy, 9 + s_dy):
            _put(px, sx, sy, white if sy < 5 + s_dy else steel_hi)
            if direction in ("down", "up"):
                _put(px, max(0, sx - 1) if sx < 8 else min(15, sx + 1), sy, steel_mid)
        # Golden Crossguard
        for gx in range(max(0, sx - 1), min(16, sx + 2)):
            _put(px, gx, 9 + s_dy, gold_hi)
        # Grip & Pommel
        _put(px, sx, 10 + s_dy, (148, 52, 36, 255))
        _put(px, sx, 11 + s_dy, gold_mid)

    # Heater Shield (Hero or Guard)
    if has_shield or role == "red_guard":
        sh_x = 11 if direction != "left" else 1
        sh_rim = gold_hi if (role in ("hero", "red_guard")) else steel_hi
        sh_fill = (204, 36, 44, 255) if role == "red_guard" else (32, 88, 208, 255)
        for sy in range(6, 12):
            for dx in range(4):
                x_pos = sh_x + dx
                if sy == 11 and dx in (0, 3):
                    continue  # Tapered heater shield bottom point
                if 0 <= x_pos < 16:
                    if sy == 6 or sy == 11 or dx in (0, 3):
                        _put(px, x_pos, sy, sh_rim)
                    elif dx in (1, 2) and sy == 8:
                        _put(px, x_pos, sy, white)  # Shield crest cross
                    elif dx == 1 and sy in (7, 9):
                        _put(px, x_pos, sy, white)
                    else:
                        _put(px, x_pos, sy, sh_fill)

    return _apply_pixel_outline(im, outline)


def generate_character_sprites() -> None:
    # characters-3.png is 320x136 (16 cols * 20px stride), 16x16 sprites
    sheet = Image.new("RGBA", (320, 136), (0, 0, 0, 0))
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
                if col >= 16:
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


def draw_monster_sprite(key: str, frame: int = 0) -> Image.Image:
    family, c1, c2, c3 = MONSTER_PALETTES.get(
        key, ("knight", (112, 148, 218), (218, 188, 72), (238, 72, 72))
    )
    size = 80 if ("dragon" in family or "dlord2" in family or key.endswith("_big")) else 64
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = size // 2, size // 2 + (1 if frame == 1 else 0)
    outline = (18, 14, 26, 255)
    col1 = (*c1, 255)
    col1_hi = _shade_rgba(col1, 36)
    col1_sh = _shade_rgba(col1, -38)
    col2 = (*c2, 255)
    col2_hi = _shade_rgba(col2, 32)
    col2_sh = _shade_rgba(col2, -32)
    col3 = (*c3, 255)
    white = (250, 252, 255, 255)

    if family == "slime":
        # Classic teardrop slime with 3-tone shading & glossy specular highlight
        d.ellipse([cx - 21, cy - 3, cx + 21, cy + 23], fill=col1_sh, outline=outline, width=2)
        d.ellipse([cx - 19, cy - 4, cx + 17, cy + 20], fill=col1)
        d.polygon([(cx - 13, cy + 2), (cx, cy - 23), (cx + 13, cy + 2)], fill=col1, outline=outline)
        d.polygon([(cx - 9, cy + 2), (cx, cy - 19), (cx + 7, cy + 2)], fill=col1)
        # Specular shine
        d.ellipse([cx - 13, cy - 1, cx - 6, cy + 5], fill=col2_hi)
        d.ellipse([cx - 10, cy - 8, cx - 6, cy - 3], fill=white)
        # Wide expressive eyes
        d.ellipse([cx - 11, cy + 4, cx - 3, cy + 12], fill=white, outline=outline)
        d.ellipse([cx + 3, cy + 4, cx + 11, cy + 12], fill=white, outline=outline)
        d.ellipse([cx - 8, cy + 6, cx - 5, cy + 10], fill=outline)
        d.ellipse([cx + 5, cy + 6, cx + 8, cy + 10], fill=outline)
        d.point((cx - 7, cy + 7), fill=white)
        d.point((cx + 6, cy + 7), fill=white)
        # Grin
        d.arc([cx - 9, cy + 10, cx + 9, cy + 19], 10, 170, fill=col3, width=2)

    elif family == "drakee":
        w_dy = -3 if frame == 1 else 0
        # Ribbed bat wings
        d.polygon([(cx - 8, cy - 2), (cx - 29, cy - 16 + w_dy), (cx - 26, cy + 9), (cx - 17, cy + 3), (cx - 11, cy + 7)], fill=col2, outline=outline)
        d.polygon([(cx + 8, cy - 2), (cx + 29, cy - 16 + w_dy), (cx + 26, cy + 9), (cx + 17, cy + 3), (cx + 11, cy + 7)], fill=col2, outline=outline)
        # Body, horned ears, talons & fangs
        d.ellipse([cx - 13, cy - 13, cx + 13, cy + 15], fill=col1_sh, outline=outline, width=2)
        d.ellipse([cx - 11, cy - 12, cx + 9, cy + 12], fill=col1)
        d.polygon([(cx - 9, cy - 10), (cx - 14, cy - 24), (cx - 3, cy - 12)], fill=col1_hi, outline=outline)
        d.polygon([(cx + 9, cy - 10), (cx + 14, cy - 24), (cx + 3, cy - 12)], fill=col1_hi, outline=outline)
        d.ellipse([cx - 8, cy - 6, cx - 2, cy], fill=col3, outline=outline)
        d.ellipse([cx + 2, cy - 6, cx + 8, cy], fill=col3, outline=outline)
        d.point((cx - 5, cy - 3), fill=outline)
        d.point((cx + 5, cy - 3), fill=outline)
        # Fanged mouth
        d.rectangle([cx - 6, cy + 3, cx + 6, cy + 8], fill=(180, 28, 38, 255), outline=outline)
        d.polygon([(cx - 5, cy + 3), (cx - 3, cy + 7), (cx - 1, cy + 3)], fill=white)
        d.polygon([(cx + 1, cy + 3), (cx + 3, cy + 7), (cx + 5, cy + 3)], fill=white)

    elif family == "ghost":
        # Tattered spectral shroud + lantern/claws
        d.ellipse([cx - 16, cy - 23, cx + 16, cy + 7], fill=col1, outline=outline, width=2)
        d.polygon([(cx - 16, cy - 4), (cx - 22, cy + 23), (cx - 10, cy + 14), (cx, cy + 25), (cx + 10, cy + 14), (cx + 22, cy + 23), (cx + 16, cy - 4)], fill=col1, outline=outline)
        d.ellipse([cx - 11, cy - 14, cx + 11, cy + 2], fill=col2_sh)
        d.ellipse([cx - 8, cy - 10, cx - 2, cy - 4], fill=col3)
        d.ellipse([cx + 2, cy - 10, cx + 8, cy - 4], fill=col3)
        d.point((cx - 5, cy - 7), fill=white)
        d.point((cx + 5, cy - 7), fill=white)

    elif family == "mage":
        # Wizard robe, wide-brimmed crooked hat, beard & arcane staff
        d.polygon([(cx - 15, cy - 4), (cx - 22, cy + 25), (cx + 22, cy + 25), (cx + 15, cy - 4)], fill=col1_sh, outline=outline, width=2)
        d.polygon([(cx - 12, cy - 4), (cx - 16, cy + 23), (cx + 12, cy + 23), (cx + 10, cy - 4)], fill=col1)
        d.line([(cx, cy - 4), (cx, cy + 24)], fill=col2, width=3)
        # Shadowed hood face & glowing eyes
        d.rectangle([cx - 10, cy - 12, cx + 10, cy - 1], fill=(20, 16, 28, 255), outline=outline)
        d.ellipse([cx - 7, cy - 9, cx - 2, cy - 4], fill=col3)
        d.ellipse([cx + 2, cy - 9, cx + 7, cy - 4], fill=col3)
        # Pointed wizard hat with brim
        d.polygon([(cx + 3, cy - 29), (cx - 20, cy - 11), (cx + 20, cy - 11)], fill=col1_hi, outline=outline)
        d.rectangle([cx - 22, cy - 13, cx + 22, cy - 10], fill=col2, outline=outline)
        # Arcane staff
        d.line([(cx + 19, cy - 20), (cx + 19, cy + 25)], fill=col2_sh, width=3)
        d.ellipse([cx + 13, cy - 26, cx + 25, cy - 14], fill=col3, outline=white, width=2)

    elif family == "scorpion":
        # Segmented armored scorpion with raised stinger & serrated pincers
        for seg in range(5):
            sy = cy - 6 - seg * 4
            sx = cx + 6 - seg * 2
            d.ellipse([sx - 5, sy - 4, sx + 5, sy + 4], fill=col2, outline=outline)
        d.polygon([(cx - 4, cy - 25), (cx - 14, cy - 20), (cx - 4, cy - 16)], fill=col3, outline=outline)
        # Segmented carapace
        d.ellipse([cx - 18, cy - 4, cx + 18, cy + 16], fill=col1, outline=outline, width=2)
        for lx in (-14, -7, 0, 7, 14):
            d.line([(cx + lx, cy + 12), (cx + lx + (4 if lx > 0 else -4), cy + 24)], fill=col2_sh, width=2)
        # Claws
        d.ellipse([cx - 28, cy + 1, cx - 12, cy + 17], fill=col2_hi, outline=outline, width=2)
        d.ellipse([cx + 12, cy + 1, cx + 28, cy + 17], fill=col2_hi, outline=outline, width=2)
        d.ellipse([cx - 7, cy + 2, cx - 2, cy + 7], fill=col3, outline=outline)
        d.ellipse([cx + 2, cy + 2, cx + 7, cy + 7], fill=col3, outline=outline)

    elif family == "skeleton":
        # Armored undead skeleton warrior with ribcage, skull jaw, broadsword & shield
        d.ellipse([cx - 11, cy - 25, cx + 11, cy - 7], fill=col1, outline=outline, width=2)
        d.rectangle([cx - 7, cy - 10, cx + 7, cy - 4], fill=col1, outline=outline)
        d.rectangle([cx - 8, cy - 4, cx + 8, cy + 13], fill=col2, outline=outline, width=2)
        for ry in range(cy - 2, cy + 11, 4):
            d.line([(cx - 9, ry), (cx + 9, ry)], fill=col1, width=2)
        # Legs
        d.line([(cx - 6, cy + 13), (cx - 9, cy + 26)], fill=col1, width=3)
        d.line([(cx + 6, cy + 13), (cx + 9, cy + 26)], fill=col1, width=3)
        # Sword & Shield
        d.line([(cx - 20, cy - 22), (cx - 14, cy + 10)], fill=white, width=3)
        d.line([(cx - 24, cy + 2), (cx - 10, cy + 2)], fill=col3, width=3)
        d.ellipse([cx + 9, cy - 7, cx + 24, cy + 13], fill=col3, outline=col1, width=2)
        # Glowing eye sockets
        d.ellipse([cx - 7, cy - 19, cx - 2, cy - 14], fill=col3, outline=outline)
        d.ellipse([cx + 2, cy - 19, cx + 7, cy - 14], fill=col3, outline=outline)

    elif family == "wolf":
        # Snarling werewolf / dire wolf with fangs, claws & fur shading
        d.polygon([(cx - 19, cy + 20), (cx - 13, cy - 8), (cx + 15, cy - 8), (cx + 21, cy + 20)], fill=col1, outline=outline, width=2)
        d.ellipse([cx - 10, cy - 4, cx + 10, cy + 16], fill=col2)
        d.polygon([(cx - 14, cy - 17), (cx - 9, cy - 28), (cx - 2, cy - 16)], fill=col1_hi, outline=outline)
        d.polygon([(cx + 2, cy - 16), (cx + 9, cy - 28), (cx + 14, cy - 17)], fill=col1_hi, outline=outline)
        d.ellipse([cx - 13, cy - 19, cx + 13, cy + 1], fill=col1_hi, outline=outline, width=2)
        d.ellipse([cx - 8, cy - 13, cx - 2, cy - 8], fill=col3, outline=outline)
        d.ellipse([cx + 2, cy - 13, cx + 8, cy - 8], fill=col3, outline=outline)
        d.rectangle([cx - 6, cy - 5, cx + 6, cy], fill=(180, 28, 36, 255), outline=outline)
        d.polygon([(cx - 4, cy - 5), (cx - 2, cy - 1), (cx, cy - 5)], fill=white)
        d.polygon([(cx, cy - 5), (cx + 2, cy - 1), (cx + 4, cy - 5)], fill=white)

    elif family == "golem":
        # Towering masonry stone/gold/brick golem with mortar lines & glowing eyes
        parts = [
            [cx - 11, cy - 25, cx + 11, cy - 10],  # head
            [cx - 19, cy - 10, cx + 19, cy + 12],  # torso
            [cx - 28, cy - 8, cx - 19, cy + 11],   # left arm
            [cx + 19, cy - 8, cx + 28, cy + 11],   # right arm
            [cx - 15, cy + 12, cx - 3, cy + 27],   # left leg
            [cx + 3, cy + 12, cx + 15, cy + 27],   # right leg
        ]
        for idx_p, rect in enumerate(parts):
            fill_c = col1 if idx_p < 2 else col2
            d.rectangle(rect, fill=fill_c, outline=outline, width=2)
            # Brick mortar lines
            for by in range(rect[1] + 5, rect[3], 6):
                d.line([(rect[0] + 2, by), (rect[2] - 2, by)], fill=col1_sh, width=1)
        d.rectangle([cx - 7, cy - 20, cx - 2, cy - 15], fill=col3, outline=outline)
        d.rectangle([cx + 2, cy - 20, cx + 7, cy - 15], fill=col3, outline=outline)

    elif family in ("droll", "druin"):
        d.ellipse([cx - 19, cy - 17, cx + 19, cy + 14], fill=col1, outline=outline, width=2)
        d.ellipse([cx - 14, cy - 13, cx + 10, cy + 8], fill=col1_hi)
        for tx in range(-14, 18, 7):
            d.line([(cx + tx, cy + 11), (cx + tx + (2 if frame == 1 else -1), cy + 25)], fill=col2, width=3)
        d.ellipse([cx - 10, cy - 7, cx - 3, cy], fill=col3, outline=outline)
        d.ellipse([cx + 3, cy - 7, cx + 10, cy], fill=col3, outline=outline)
        d.point((cx - 6, cy - 4), fill=outline)
        d.point((cx + 6, cy - 4), fill=outline)

    elif family == "knight":
        # Full plate Dark/Axe/Armored Knight with horned helm, cape, battle-axe/sword & kite shield
        d.polygon([(cx - 18, cy - 6), (cx - 24, cy + 24), (cx + 24, cy + 24), (cx + 18, cy - 6)], fill=col2_sh, outline=outline)
        d.polygon([(cx - 5, cy - 29), (cx, cy - 18), (cx + 10, cy - 27)], fill=col3, outline=outline)
        d.rectangle([cx - 10, cy - 21, cx + 10, cy - 6], fill=col2, outline=outline, width=2)
        # Horns on helm
        d.polygon([(cx - 10, cy - 18), (cx - 19, cy - 25), (cx - 10, cy - 12)], fill=white, outline=outline)
        d.polygon([(cx + 10, cy - 18), (cx + 19, cy - 25), (cx + 10, cy - 12)], fill=white, outline=outline)
        # Visor & glowing eyes
        d.rectangle([cx - 7, cy - 16, cx + 7, cy - 11], fill=outline)
        d.point((cx - 3, cy - 14), fill=col3)
        d.point((cx + 3, cy - 14), fill=col3)
        # Breastplate & greaves
        d.rectangle([cx - 14, cy - 6, cx + 14, cy + 14], fill=col1, outline=outline, width=2)
        d.line([(cx, cy - 4), (cx, cy + 12)], fill=col2_hi, width=2)
        d.rectangle([cx - 13, cy + 14, cx - 3, cy + 27], fill=col2, outline=outline, width=2)
        d.rectangle([cx + 3, cy + 14, cx + 13, cy + 27], fill=col2, outline=outline, width=2)
        # Emblazoned Kite Shield
        d.polygon([(cx + 11, cy - 6), (cx + 26, cy - 6), (cx + 26, cy + 8), (cx + 18, cy + 18), (cx + 11, cy + 8)], fill=col3, outline=outline)
        d.line([(cx + 18, cy - 3), (cx + 18, cy + 14)], fill=white, width=2)
        d.line([(cx + 14, cy + 3), (cx + 23, cy + 3)], fill=white, width=2)
        # Halberd / Double-Bit Battle Axe
        d.line([(cx - 20, cy - 25), (cx - 16, cy + 16)], fill=white, width=3)
        d.polygon([(cx - 20, cy - 22), (cx - 30, cy - 14), (cx - 20, cy - 6)], fill=col2_hi, outline=outline)

    elif family in ("wyvern", "dragon", "dlord2"):
        # True Fierce Dragon / Dragonlord Form 2: Bat-wings with ribs, serpentine neck,
        # horned snout with fangs & fire breath, ribbed golden belly, clawed legs & spiked tail!
        w_lift = -4 if frame == 1 else 0
        # Left & Right Great Dragon Wings
        d.polygon([
            (cx - 8, cy - 8), (cx - 37, cy - 30 + w_lift), (cx - 35, cy - 4),
            (cx - 26, cy + 8), (cx - 18, cy + 2), (cx - 12, cy + 8)
        ], fill=col2_sh, outline=outline)
        d.polygon([
            (cx - 8, cy - 6), (cx - 34, cy - 26 + w_lift), (cx - 31, cy - 4), (cx - 12, cy + 4)
        ], fill=col2)
        d.polygon([
            (cx + 8, cy - 8), (cx + 37, cy - 30 + w_lift), (cx + 35, cy - 4),
            (cx + 26, cy + 8), (cx + 18, cy + 2), (cx + 12, cy + 8)
        ], fill=col2_sh, outline=outline)
        d.polygon([
            (cx + 8, cy - 6), (cx + 34, cy - 26 + w_lift), (cx + 31, cy - 4), (cx + 12, cy + 4)
        ], fill=col2)

        # Whipping Spiked Tail
        d.polygon([(cx + 12, cy + 16), (cx + 34, cy + 26), (cx + 30, cy + 18), (cx + 15, cy + 10)], fill=col1, outline=outline)

        # Muscular Legs & Talons
        for side in (-1, 1):
            lx = cx + side * 14
            d.ellipse([lx - 7, cy + 10, lx + 7, cy + 26], fill=col1_sh, outline=outline, width=2)
            for cl in (-4, 0, 4):
                d.polygon([(lx + cl, cy + 24), (lx + cl + side * 2, cy + 31), (lx + cl + 2, cy + 24)], fill=white, outline=outline)

        # Torso & Armored Golden Belly Scales
        d.ellipse([cx - 17, cy - 8, cx + 17, cy + 25], fill=col1, outline=outline, width=2)
        d.ellipse([cx - 11, cy - 3, cx + 11, cy + 22], fill=col2_hi, outline=outline)
        for by in range(cy, cy + 20, 4):
            d.line([(cx - 9, by), (cx + 9, by)], fill=col2_sh, width=2)

        # Serpentine Neck, Fierce Snout Head & Sweeping Horns
        d.polygon([(cx - 9, cy - 6), (cx - 12, cy - 25), (cx + 12, cy - 25), (cx + 9, cy - 6)], fill=col1, outline=outline)
        d.polygon([(cx - 11, cy - 26), (cx - 24, cy - 37), (cx - 4, cy - 26)], fill=col2_hi, outline=outline)
        d.polygon([(cx + 11, cy - 26), (cx + 24, cy - 37), (cx + 4, cy - 26)], fill=col2_hi, outline=outline)
        d.ellipse([cx - 13, cy - 29, cx + 13, cy - 11], fill=col1_hi, outline=outline, width=2)
        # Jaws, Fangs & Flame Breath
        d.rectangle([cx - 9, cy - 16, cx + 9, cy - 10], fill=(196, 28, 38, 255), outline=outline)
        for fx in (-6, -2, 2, 6):
            d.polygon([(cx + fx, cy - 16), (cx + fx + 1, cy - 12), (cx + fx + 2, cy - 16)], fill=white)
        # Glowing Dragon Eyes
        d.ellipse([cx - 8, cy - 24, cx - 2, cy - 18], fill=col3, outline=outline)
        d.ellipse([cx + 2, cy - 24, cx + 8, cy - 18], fill=col3, outline=outline)
        d.point((cx - 5, cy - 21), fill=white)
        d.point((cx + 5, cy - 21), fill=white)

    else:  # dlord1 (Dragonlord Sorcerer King Form 1)
        # Flowing dark-violet & crimson cape + horned crown + Dragon Orb Staff
        d.polygon([(cx - 22, cy + 26), (cx - 16, cy - 12), (cx + 16, cy - 12), (cx + 22, cy + 26)], fill=col1_sh, outline=outline, width=2)
        d.polygon([(cx - 16, cy + 25), (cx - 11, cy - 10), (cx + 11, cy - 10), (cx + 16, cy + 25)], fill=col1)
        d.line([(cx, cy - 8), (cx, cy + 25)], fill=col2, width=4)
        # High Bat-Collar & Visage
        d.polygon([(cx - 18, cy - 6), (cx - 12, cy - 18), (cx + 12, cy - 18), (cx + 18, cy - 6)], fill=col3, outline=outline)
        d.ellipse([cx - 10, cy - 24, cx + 10, cy - 6], fill=(182, 214, 172, 255), outline=outline, width=2)
        # Horned Crown
        d.polygon([(cx - 8, cy - 22), (cx - 18, cy - 32), (cx - 3, cy - 20)], fill=col2_hi, outline=outline)
        d.polygon([(cx + 8, cy - 22), (cx + 18, cy - 32), (cx + 3, cy - 20)], fill=col2_hi, outline=outline)
        d.ellipse([cx - 6, cy - 17, cx - 2, cy - 13], fill=col3, outline=outline)
        d.ellipse([cx + 2, cy - 17, cx + 6, cy - 13], fill=col3, outline=outline)
        # Staff
        d.line([(cx + 21, cy - 24), (cx + 21, cy + 26)], fill=col2, width=3)
        d.ellipse([cx + 15, cy - 30, cx + 27, cy - 18], fill=col3, outline=white, width=2)

    return im


def generate_monster_sprites() -> None:
    bestiary_dir1 = ASSETS_DIR / "sprites" / "bestiary"
    bestiary_dir2 = ASSETS_DIR / "reference" / "mikesrpgcenter" / "bestiary"
    bestiary_dir1.mkdir(parents=True, exist_ok=True)
    bestiary_dir2.mkdir(parents=True, exist_ok=True)

    for key in MONSTER_PALETTES:
        im = draw_monster_sprite(key, 0)
        im.save(bestiary_dir1 / f"{key}.png")
        im.save(bestiary_dir2 / f"{key}.png")

    # Also build monsters-2.png sheet (407x457 RGBA) matching sprite_frames.json
    sf = json.loads((DATA_DIR / "sprite_frames.json").read_text(encoding="utf-8"))
    msheet = Image.new("RGBA", (407, 457), (0, 0, 0, 0))
    mdefs = sf.get("monsters", {})
    for mkey, mval in mdefs.items():
        if not isinstance(mval, dict):
            continue
        for f_idx, fn in enumerate(("frame0", "frame1")):
            rect = mval.get(fn)
            if isinstance(rect, dict):
                rx, ry, rw, rh = int(rect["x"]), int(rect["y"]), int(rect["w"]), int(rect["h"])
                base_im = draw_monster_sprite(mkey, f_idx)
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
        font_lg = ImageFont.load_default(size=24)
        font_sm = ImageFont.load_default(size=16)
    except TypeError:
        font_lg = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    td.text((84, 120), "QUEST: WARRIOR DRAGON", fill=(24, 16, 12, 255), font=font_lg)
    td.text((82, 118), "QUEST: WARRIOR DRAGON", fill=(252, 214, 68, 255), font=font_lg)
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
    print("[1/5] Generating character & NPC sprite sheets + 102 sliced frames...")
    generate_character_sprites()
    print("[2/5] Generating 124x124 overworld map and terrain...")
    generate_overworld_map()
    print("[3/5] Generating 362 copyright-free 16x16 tiles and 29 maps...")
    generate_tiles_and_maps()
    print("[4/5] Generating 44 original monster battle sprites, spell icons, and title screen...")
    generate_monster_sprites()
    generate_spells_and_title()
    print("[5/5] Synthesizing 45 original chiptune BGM & SFX MP3 files...")
    generate_audio_assets()
    print("Done! All assets in games/quest-warrior-dragon/assets/ are 100% original and copyright-free.")


if __name__ == "__main__":
    main()
