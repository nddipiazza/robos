#!/usr/bin/env python3
"""Generate a labeled tile reference PNG for any throne room map grid.
Usage: python3 scripts/gen_tile_reference.py
Output: docs/tile_reference.png
"""
from PIL import Image, ImageDraw
import sys, os

MAP_W, MAP_H = 12, 12
TILE_SRC = 16

MAP_GRID = [
    [90,90,90,90,90,90,90,90,90,90,90,90],
    [90, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,90],
    [90, 1, 3, 3, 3, 3, 3,30, 3, 3, 1,90],
    [90, 1, 3, 8, 8, 8, 8, 8, 8, 3, 1,90],
    [90, 1, 3, 8,91, 8, 8, 3, 8, 3, 1,90],
    [90, 1, 3, 3, 3,30,30, 3, 3, 3, 1,90],
    [90, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1,90],
    [90, 1, 3, 3,26, 3,73, 3, 3, 3, 1,90],
    [90, 1, 1, 1, 1,10, 1, 1, 1, 1, 1,90],
    [90, 1, 3, 3, 3, 3, 3, 3, 3,33, 1,90],
    [90, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,90],
    [90,90,90,90,90,90,90,90,90,90,90,90],
]

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(root, "assets/maps/tantegel-castle-2f.png")).convert("RGBA")

tile_samples = {}
for row in range(MAP_H):
    for col in range(MAP_W):
        tid = MAP_GRID[row][col]
        if tid not in tile_samples:
            tile_samples[tid] = src.crop((col*TILE_SRC, row*TILE_SRC, (col+1)*TILE_SRC, (row+1)*TILE_SRC))

CELL, LABEL_H, COLS = 64, 16, 5
unique = sorted(tile_samples)
ROWS = (len(unique) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS*CELL, ROWS*(CELL+LABEL_H)), (30,30,30,255))
draw = ImageDraw.Draw(sheet)
for i, tid in enumerate(unique):
    cx, cy = (i % COLS)*CELL, (i // COLS)*(CELL+LABEL_H)
    sheet.paste(tile_samples[tid].resize((CELL,CELL), Image.NEAREST), (cx,cy))
    draw.text((cx+2, cy+CELL+1), f"ID:{tid}", fill=(255,220,50))

out = os.path.join(root, "docs/tile_reference.png")
sheet.save(out)
print(f"Saved {out} ({len(unique)} unique tiles: {unique})")
