#!/usr/bin/env python3
"""Generate annotated world-map grid PNG at 64px/tile.
Every tile shows its x,y coordinate. Special locations are highlighted.
Usage: python3 tools/gen_worldmap_grid.py
Output: assets/maps/grid_views/world-map_grid.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PNG = os.path.join(ROOT, "assets/maps/dw1-over2.png")
OUT_PNG = os.path.join(ROOT, "assets/maps/grid_views/world-map_grid.png")

TILE_SRC = 16
TILE_PX  = 64    # 4× upscale — room for labels
TILES    = 124   # 1984 / 16

TEXT_BG  = (0, 0, 0, 210)

def load_font(size):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    ]:
        if os.path.exists(path): return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def draw_label(draw, x, y, text, color, font):
    bb = draw.textbbox((0,0), text, font=font)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    draw.rectangle([x-2, y-2, x+tw+2, y+th+2], fill=TEXT_BG)
    draw.text((x, y), text, fill=color, font=font)

LOCATIONS = [
    (45,  45, "TANTEGEL",       (255, 220, 100)),
    (50,  43, "BRECCONARY",     (100, 255, 150)),
    (4,    4, "GARINHAM",       (100, 255, 150)),
    (106, 12, "KOL",            (100, 255, 150)),
    (104, 74, "RIMULDAR",       (100, 255, 150)),
    (75, 104, "CANTLIN",        (100, 255, 150)),
    (27,  91, "HAUKSNESS",      (100, 255, 150)),
    (50,  50, "CHARLOCK",       (255,  80,  80)),
    (30,  14, "ERDRICK CAVE",   (180, 100, 255)),
    (31,  59, "MTN CAVE",       (180, 100, 255)),
    (106, 46, "SWAMP CAVE N",   (180, 100, 255)),
    (106, 51, "SWAMP CAVE S",   (180, 100, 255)),
    (83,   3, "STAFF CAVE",     (180, 100, 255)),
    (110,111, "RAINBOW CAVE",   (180, 100, 255)),
    (66,  51, "BRIDGE",         (  0, 230, 255)),
    (85, 114, "ERDRICK TOKEN",  (255, 200,   0)),
]

def main():
    src = Image.open(SRC_PNG).convert("RGBA")
    display_size = TILES * TILE_PX
    # Scale source up 4×
    out = src.resize((display_size, display_size), Image.NEAREST)
    draw = ImageDraw.Draw(out)
    font    = load_font(9)
    font_sm = load_font(8)

    # Per-tile box + x,y coordinate on every tile
    for r in range(TILES):
        for c in range(TILES):
            x0, y0 = c * TILE_PX, r * TILE_PX
            draw.rectangle([x0, y0, x0+TILE_PX-1, y0+TILE_PX-1],
                           outline=(160, 160, 180, 180), width=1)
            draw_label(draw, x0+2, y0+2, f"{c},{r}", (255, 255, 100), font_sm)

    # Location markers (drawn on top)
    for col, row, label, color in LOCATIONS:
        if col >= TILES or row >= TILES:
            print(f"  WARN: {label} at ({col},{row}) out of range"); continue
        x0, y0 = col * TILE_PX, row * TILE_PX
        draw.rectangle([x0, y0, x0+TILE_PX-1, y0+TILE_PX-1], outline=color, width=3)
        draw_label(draw, x0+2, y0+14, label,         color, font)
        draw_label(draw, x0+2, y0+2,  f"{col},{row}", color, font_sm)

    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    out.save(OUT_PNG)
    print(f"Saved world-map_grid.png ({display_size}×{display_size}px, {TILES}×{TILES} tiles)")

if __name__ == "__main__":
    main()
