#!/usr/bin/env python3
"""Generate annotated 64px/tile grid PNGs for all dungeon/town maps.
Reconstructs each map tile-by-tile from assets/tiles/tile_NNN.png + map_grids.json,
then overlays stair/chest/door IDs and shop/inn NPC markers.
Usage: python3 tools/gen_grid_views.py
Output: assets/maps/grid_views/<map-key>_grid.png
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_SRC = 16
TILE_PX  = 64   # 4× upscale
FONT_SZ  = 9
TEXT_BG  = (0, 0, 0, 220)

def load_font(size=FONT_SZ):
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

def load_tile_cache(tiles_dir):
    cache = {}
    for fname in os.listdir(tiles_dir):
        if not fname.endswith('.png') or fname.endswith('.import'): continue
        try:
            tid = int(fname.replace('tile_','').replace('.png',''))
            img = Image.open(os.path.join(tiles_dir, fname)).convert("RGBA")
            cache[tid] = img.resize((TILE_PX, TILE_PX), Image.NEAREST)
        except: pass
    return cache

def render_map(map_key, grid_data, tile_cache, out_path, stairs, chests, doors, shops, inns, npcs):
    print(f"Rendering ${map_key}")
    rows = grid_data['rows']
    cols = grid_data['cols']
    grid = grid_data['grid']

    out = Image.new("RGBA", (cols * TILE_PX, rows * TILE_PX), (20, 20, 30, 255))
    draw = ImageDraw.Draw(out)
    font    = load_font(FONT_SZ)
    font_sm = load_font(8)

    # Draw tiles from tile sprites
    fallback = Image.new("RGBA", (TILE_PX, TILE_PX), (60, 0, 80, 255))
    for r in range(rows):
        for c in range(cols):
            tid = grid[r][c]
            tile = tile_cache.get(tid, fallback)
            out.paste(tile, (c * TILE_PX, r * TILE_PX), tile)

    # Pass 1: draw all annotation BORDERS first (under text)
    for s in stairs:
        c, r = s['tile']['col'], s['tile']['row']
        tid2 = grid[r][c]
        color = (0,230,255) if tid2==34 else (220,100,255) if tid2==33 else (80,255,120)
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw.rectangle([x0,y0,x0+TILE_PX-4,y0+TILE_PX-4], outline=color, width=3)
    for ch in chests:
        c, r = ch['col'], ch['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        color = (255, 100, 255) if ch.get('hidden') else (255, 210, 0)
        draw.rectangle([x0,y0,x0+TILE_PX-4,y0+TILE_PX-4], outline=color, width=3)
    for npc in npcs:
        c, r = npc['col'], npc['row']
        deskTile = npc.get("desk_tile")
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        color = (255, 0, 0)
        draw.rectangle([x0,y0,x0+TILE_PX-4,y0+TILE_PX-4], outline=color, width=3)
        if deskTile:
            x0, y0 = deskTile[0] * TILE_PX + 2, deskTile[1] * TILE_PX + 2
            draw.rectangle([x0, y0, x0 + TILE_PX - 4, y0 + TILE_PX - 4], outline=color, width=3)

    for d in doors:
        c, r = d['col'], d['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw.rectangle([x0,y0,x0+TILE_PX-4,y0+TILE_PX-4], outline=(255,140,0), width=2)
    for sh in shops:
        c, r = sh['col'], sh['row']
        deskc, deskr = sh['deskCol'], sh['deskRow']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        outline_color = (50,255,100) if sh.get('label') == 'WPN' else (255,255,0)
        draw.rectangle([x0,y0,x0+TILE_PX-4,y0+TILE_PX-4], outline=outline_color, width=3)
        x0, y0 = deskc * TILE_PX + 2, deskr * TILE_PX + 2
        draw.rectangle([x0, y0, x0 + TILE_PX - 4, y0 + TILE_PX - 4], outline=outline_color, width=3)

    for inn in inns:
        c, r = inn['col'], inn['row']
        deskc, deskr = inn['deskCol'], inn['deskRow']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw.rectangle([x0,y0,x0+TILE_PX-4,y0+TILE_PX-4], outline=(255,100,200), width=3)
        x0, y0 = deskc * TILE_PX + 2, deskr * TILE_PX + 2
        draw.rectangle([x0, y0, x0 + TILE_PX - 4, y0 + TILE_PX - 4], outline=(255, 100, 200), width=3)

    # Pass 2: per-tile grid box + tile ID + x,y (on top of annotation borders)
    for r in range(rows):
        for c in range(cols):
            tid = grid[r][c]
            x0, y0 = c*TILE_PX, r*TILE_PX
            draw.rectangle([x0, y0, x0+TILE_PX-1, y0+TILE_PX-1], outline=(160,160,180,200), width=1)
            draw_label(draw, x0+5, y0+2,  str(tid),   (220,220,220), font_sm)
            draw_label(draw, x0+5, y0+14, f"{c},{r}", (255,255,100), font_sm)

    # Pass 3: annotation text labels (on top of everything)
    for s in stairs:
        c, r = s['tile']['col'], s['tile']['row']
        tid2 = grid[r][c]
        color = (0,230,255) if tid2==34 else (220,100,255) if tid2==33 else (80,255,120)
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw_label(draw, x0+5, y0+28, s.get('id','?'),      color, font_sm)
        draw_label(draw, x0+5, y0+40, f"→{s.get('to','?')}", color, font_sm)
    for ch in chests:
        c, r = ch['col'], ch['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        color = (255, 100, 255) if ch.get('hidden') else (255, 210, 0)
        lbl = ch.get('id','?') + (" (hidden)" if ch.get('hidden') else "")
        draw_label(draw, x0+5, y0+28, lbl, color, font_sm)
    for d in doors:
        c, r = d['col'], d['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw_label(draw, x0+5, y0+28, d.get('id','?'), (255,140,0), font_sm)
    for sh in shops:
        c, r = sh['col'], sh['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        color = (50, 255, 100) if sh.get('label') == 'WPN' else (255, 155, 95)
        draw_label(draw, x0 + 5, y0 + 28, sh['shop_id'], color, font)
    for inn in inns:
        c, r = inn['col'], inn['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw_label(draw, x0+5, y0+28, inn['id'], (255,100,200), font)
    for npc in npcs:
        c, r = npc['col'], npc['row']
        x0, y0 = c*TILE_PX+2, r*TILE_PX+2
        draw_label(draw, x0+5, y0+28, npc['id'], (255,100,200), font)

    out.save(out_path)
    print(f"  → {os.path.basename(out_path)} ({cols}×{rows})")

def main():
    with open(os.path.join(ROOT,"data/map_grids.json")) as f:
        map_grids = json.load(f)["maps"]
    with open(os.path.join(ROOT,"data/stair_registry.json")) as f:
        stair_reg = json.load(f)
    with open(os.path.join(ROOT,"data/chest_registry.json")) as f:
        chest_reg = json.load(f)
    with open(os.path.join(ROOT,"data/door_registry.json")) as f:
        door_reg  = json.load(f)
    with open(os.path.join(ROOT,"data/npc_registry.json")) as f:
        npc_reg = json.load(f)
    with open(os.path.join(ROOT,"data/shops.json")) as f:
        shops_data = json.load(f)
    with open(os.path.join(ROOT,"data/inns.json")) as f:
        inns_data = json.load(f)

    # Build shops_by_map from shops.json
    TYPE_LABEL = {
        "weapon_armor_shop": "WPN",
        "item_shop":         "ITM",
        "key_shop":          "KEY",
    }
    shops_by_map = {}
    for s in shops_data:
        mk = s.get("map_key")
        tile = s.get("npc_tile")
        deskTile = s.get("desk_tile")
        if not mk or not tile:
            continue
        label = TYPE_LABEL.get(s.get("type",""), "SHOP")
        shops_by_map.setdefault(mk, []).append(
            {"col": tile[0], "row": tile[1], "label": label, "shop_id": s["id"], "deskCol": deskTile[0], "deskRow": deskTile[1]}
        )

    # Build inns_by_map from inns.json
    inns_by_map = {}
    for inn in inns_data:
        mk = inn.get("map_key")
        tile = inn.get("npc_tile")
        desk = inn.get("desk_tile")
        if not mk or not tile:
            continue
        inns_by_map.setdefault(mk, []).append(
            {"col": tile[0], "row": tile[1], "cost": inn.get("cost", 6), "id": inn.get("id"), "deskCol": desk[0], "deskRow": desk[1]}
        )

    out_dir   = os.path.join(ROOT,"assets/maps/grid_views")
    tiles_dir = os.path.join(ROOT,"assets/tiles")
    os.makedirs(out_dir, exist_ok=True)

    print("Loading tile sprites...", end=" ", flush=True)
    tile_cache = load_tile_cache(tiles_dir)
    print(f"{len(tile_cache)} tiles loaded.")

    skip = {"world-map"}
    keys = [k for k in map_grids if k not in skip]
    print(f"Rendering {len(keys)} maps...")
    for map_key in keys:
        out = os.path.join(out_dir, f"{map_key}_grid.png")
        render_map(map_key, map_grids[map_key], tile_cache, out,
            stair_reg.get(map_key,[]),
            chest_reg.get(map_key,[]),
            door_reg.get(map_key,[]),
            shops_by_map.get(map_key,[]),
            inns_by_map.get(map_key,[]),
            npc_reg.get(map_key, []))
    print("Done.")

if __name__ == "__main__":
    main()
