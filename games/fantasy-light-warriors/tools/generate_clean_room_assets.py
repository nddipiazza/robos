#!/usr/bin/env python3
"""
Procedural Clean-Room Pixel Art & Chiptune Audio Generator for
RobOS Fantasy: Light Warriors (WIP) (`games/fantasy-light-warriors`).

Generates 100% original, copyright-free 8-bit assets directly from semantic
game data (`data/maps/*.json`, `data/enemies.json`, `data/classes_and_xp.json`):
  1. Five 1024x1024 (`64x64` tiles of `16x16` px) Act I maps:
     - `assets/maps/coneria.png`
     - `assets/maps/coneria_castle_1f.png`
     - `assets/maps/coneria_castle_2f.png`
     - `assets/maps/temple_of_fiends.png`
     - `assets/maps/overworld_coneria.png`
  2. 12 Hero Class battle (`32x48`) & 3-frame walk (`48x16`) sprite sheets:
     - `assets/sprites/classes/<slug>_battle.png`
     - `assets/sprites/classes/<slug>_walk.png`
  3. 28 NPC sprites (`assets/sprites/npcs/gfx_00.png`..`gfx_27.png` + `obj_to_gfx.json`)
  4. Enemy battle sprites (`assets/sprites/enemies/*.png`: `imp.png`, `garland.png`, etc.)
  5. Authentic 2-step 8-bit Shop interior counters & pointing glove cursor:
     - `assets/sprites/shops/weapon_counter.png`
     - `assets/sprites/shops/item_counter.png`
     - `assets/sprites/shops/hand_cursor.png`
  6. 14 Chiptune BGM & fanfare MP3 tracks (`assets/music/*.mp3`)
  7. Project `icon.svg`
"""

from __future__ import annotations

import json
import math
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
ASSETS_DIR = ROOT / "assets"


# ---------------------------------------------------------------------------
# 1. PROCEDURAL 16x16 TILE PAINTERS & 64x64 MAP GENERATOR
# ---------------------------------------------------------------------------

def _make_tile(bg: tuple[int, int, int, int]) -> tuple[Image.Image, any]:
    im = Image.new("RGBA", (16, 16), bg)
    return im, im.load()


def _tile_grass(variant: int = 0) -> Image.Image:
    im, px = _make_tile((48, 168, 44, 255))
    hi = (92, 214, 68, 255)
    dk = (28, 120, 26, 255)
    for y in range(0, 16, 4):
        for x in range((y + variant) % 4, 16, 4):
            px[x, y] = hi
            if x + 1 < 16 and y + 1 < 16:
                px[x + 1, y + 1] = dk
    return im


def _tile_forest() -> Image.Image:
    im = _tile_grass(1)
    d = ImageDraw.Draw(im)
    # Trunk
    d.rectangle([6, 10, 9, 15], fill=(120, 72, 28, 255), outline=(40, 24, 10, 255))
    # Canopy
    d.ellipse([1, 1, 14, 12], fill=(24, 124, 32, 255), outline=(12, 64, 16, 255))
    d.ellipse([3, 2, 11, 8], fill=(64, 180, 56, 255))
    return im


def _tile_water() -> Image.Image:
    im, px = _make_tile((24, 88, 208, 255))
    wave_hi = (116, 184, 252, 255)
    wave_dk = (14, 52, 148, 255)
    for y in (3, 7, 11, 15):
        offset = 2 if (y // 4) % 2 else 0
        for x in range(offset, 14, 6):
            px[x, y] = wave_hi
            px[x + 1, y] = wave_hi
            if y - 1 >= 0:
                px[x + 2, y - 1] = wave_dk
    return im


def _tile_mountain() -> Image.Image:
    im = _tile_grass(2)
    d = ImageDraw.Draw(im)
    d.polygon([(1, 14), (6, 2), (11, 14)], fill=(156, 142, 124, 255), outline=(36, 30, 26, 255))
    d.polygon([(6, 14), (11, 4), (15, 14)], fill=(128, 114, 98, 255), outline=(36, 30, 26, 255))
    d.polygon([(4, 6), (6, 2), (8, 6)], fill=(238, 242, 248, 255))
    return im


def _tile_bridge() -> Image.Image:
    im = _tile_water()
    d = ImageDraw.Draw(im)
    d.rectangle([2, 0, 13, 15], fill=(168, 112, 48, 255), outline=(64, 38, 12, 255))
    for y in range(2, 15, 3):
        d.line([(3, y), (12, y)], fill=(96, 58, 20, 255))
    return im


def _tile_cobble(base: tuple[int, int, int], mortar: tuple[int, int, int]) -> Image.Image:
    im, px = _make_tile((*base, 255))
    m = (*mortar, 255)
    for y in range(16):
        if y in (0, 7, 15):
            for x in range(16):
                px[x, y] = m
        else:
            split_x = 7 if y < 7 else 11
            px[0, y] = m
            px[split_x, y] = m
            px[15, y] = m
    return im


def _tile_wall_brick(face: tuple[int, int, int], edge: tuple[int, int, int]) -> Image.Image:
    im, px = _make_tile((*face, 255))
    e = (*edge, 255)
    hi = (min(255, face[0] + 32), min(255, face[1] + 32), min(255, face[2] + 32), 255)
    for y in range(16):
        for x in range(16):
            if y in (0, 4, 8, 12) or (x + (y // 4) * 4) % 8 == 0:
                px[x, y] = e
            elif y in (1, 5, 9, 13):
                px[x, y] = hi
    return im


def _tile_door(locked: bool = False) -> Image.Image:
    im, _ = _make_tile((42, 28, 18, 255))
    d = ImageDraw.Draw(im)
    fill = (148, 88, 36, 255) if not locked else (128, 52, 68, 255)
    d.rectangle([1, 1, 14, 15], fill=fill, outline=(24, 16, 10, 255))
    d.line([(8, 2), (8, 14)], fill=(58, 34, 14, 255))
    d.rectangle([10, 7, 12, 9], fill=(248, 212, 64, 255))
    return im


def _tile_stairs(up: bool = True) -> Image.Image:
    im, _ = _make_tile((32, 36, 52, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 1, 14, 14], outline=(188, 196, 214, 255))
    for i in range(4):
        y = 3 + i * 3
        x0 = 3 + (i * 2 if up else (3 - i) * 2)
        d.rectangle([x0, y, 13, y + 1], fill=(224, 230, 242, 255))
    return im


def _tile_chest() -> Image.Image:
    im, _ = _make_tile((44, 52, 76, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 4, 13, 13], fill=(188, 92, 28, 255), outline=(24, 14, 8, 255))
    d.rectangle([2, 4, 13, 7], fill=(214, 118, 38, 255), outline=(24, 14, 8, 255))
    d.rectangle([6, 6, 9, 9], fill=(252, 218, 64, 255))
    return im


def _tile_throne_carpet() -> Image.Image:
    im, _ = _make_tile((176, 28, 38, 255))
    d = ImageDraw.Draw(im)
    d.line([(1, 0), (1, 15)], fill=(244, 204, 68, 255))
    d.line([(14, 0), (14, 15)], fill=(244, 204, 68, 255))
    return im


def _build_single_map_png(map_json_path: Path, out_png_path: Path, theme: str) -> None:
    mdata = json.loads(map_json_path.read_text(encoding="utf-8"))
    w = int(mdata.get("width", 64))
    h = int(mdata.get("height", 64))
    grid = mdata.get("grid", [])
    raw_tdefs = mdata.get("tileDefinitions", {})
    tdefs: dict[int, dict] = {}
    if isinstance(raw_tdefs, dict):
        for k, v in raw_tdefs.items():
            if isinstance(v, dict):
                tdefs[int(v.get("tileId", int(str(k))))] = v

    grass = _tile_grass(0)
    forest = _tile_forest()
    water = _tile_water()
    mountain = _tile_mountain()
    bridge = _tile_bridge()

    if theme == "town":
        floor_tile = _tile_cobble((184, 178, 162), (128, 122, 108))
        wall_tile = _tile_wall_brick((142, 86, 54), (78, 44, 24))
        border_tile = water
    elif theme == "castle":
        floor_tile = _tile_cobble((148, 158, 184), (96, 106, 132))
        wall_tile = _tile_wall_brick((92, 102, 126), (44, 50, 68))
        border_tile = _tile_wall_brick((52, 58, 76), (26, 30, 42))
    elif theme == "temple":
        floor_tile = _tile_cobble((64, 58, 96), (38, 34, 62))
        wall_tile = _tile_wall_brick((104, 76, 142), (46, 32, 72))
        border_tile = _tile_wall_brick((34, 24, 52), (18, 12, 28))
    else:
        floor_tile = grass
        wall_tile = mountain
        border_tile = water

    canvas = Image.new("RGBA", (w * 16, h * 16), (16, 20, 36, 255))

    for ry in range(h):
        row = grid[ry] if ry < len(grid) else []
        for rx in range(w):
            tid = int(row[rx]) if rx < len(row) else 0
            td = tdefs.get(tid, {})
            walkable = bool(td.get("walkable", True))

            if theme == "overworld":
                if td.get("entranceTeleportId") is not None:
                    tmap = int(td.get("targetMapId") or 0)
                    if tmap == 0:
                        tile_im = _tile_cobble((224, 196, 136), (132, 92, 44))
                    elif tmap == 8:
                        tile_im = _tile_wall_brick((212, 218, 232), (96, 104, 128))
                    else:
                        tile_im = _tile_wall_brick((128, 88, 168), (54, 34, 82))
                elif not walkable:
                    if td.get("ship") or td.get("canoe"):
                        tile_im = water
                    else:
                        tile_im = mountain
                elif td.get("forest"):
                    tile_im = forest
                else:
                    tile_im = grass
            else:
                if rx in (0, w - 1) or ry in (0, h - 1):
                    tile_im = border_tile if not walkable else floor_tile
                elif walkable:
                    if theme == "castle" and 11 <= rx <= 13 and 4 <= ry <= 34:
                        tile_im = _tile_throne_carpet()
                    else:
                        tile_im = floor_tile
                else:
                    tile_im = wall_tile

            canvas.paste(tile_im, (rx * 16, ry * 16))

    # Overlay teleports / stairs
    for tp in mdata.get("teleports", []):
        if isinstance(tp, dict):
            tx, ty = int(tp.get("x", 0)), int(tp.get("y", 0))
            if 0 <= tx < w and 0 <= ty < h:
                canvas.paste(_tile_stairs(up=True), (tx * 16, ty * 16))

    # Overlay doors and shops
    draw = ImageDraw.Draw(canvas)
    shop_badges = {
        1: ("WPN", (212, 68, 56, 255)),
        11: ("ARM", (56, 132, 212, 255)),
        21: ("WHT", (232, 232, 242, 255)),
        31: ("BLK", (92, 64, 168, 255)),
        41: ("CLN", (64, 184, 132, 255)),
        51: ("INN", (224, 168, 48, 255)),
        61: ("ITM", (184, 118, 52, 255)),
    }
    for trig in mdata.get("doorsShopsAndTriggers", []):
        if not isinstance(trig, dict):
            continue
        dx, dy = int(trig.get("x", 0)), int(trig.get("y", 0))
        ttype = str(trig.get("triggerType", ""))
        if ttype == "shop":
            canvas.paste(_tile_door(False), (dx * 16, dy * 16))
            sid = int(trig.get("shopId", 0))
            badge_txt, badge_col = shop_badges.get(sid, ("SHP", (212, 168, 56, 255)))
            if dy > 0:
                bx, by = dx * 16, (dy - 1) * 16
                draw.rectangle([bx, by + 2, bx + 15, by + 14], fill=badge_col, outline=(18, 18, 26, 255))
        elif "door" in ttype:
            canvas.paste(_tile_door("locked" in ttype), (dx * 16, dy * 16))

    # Overlay treasure chests
    for ch in mdata.get("chests", []):
        if isinstance(ch, dict):
            cx, cy = int(ch.get("x", 0)), int(ch.get("y", 0))
            if 0 <= cx < w and 0 <= cy < h:
                canvas.paste(_tile_chest(), (cx * 16, cy * 16))

    # Overworld North Bridge marker at (38, 44)
    if theme == "overworld":
        canvas.paste(bridge, (38 * 16, 44 * 16))

    out_png_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_png_path)


def generate_maps() -> None:
    maps_dir = ASSETS_DIR / "maps"
    maps_dir.mkdir(parents=True, exist_ok=True)
    jobs = [
        (DATA_DIR / "maps" / "map_00_coneria.json", maps_dir / "coneria.png", "town"),
        (DATA_DIR / "maps" / "map_08_coneria_castle_1f.json", maps_dir / "coneria_castle_1f.png", "castle"),
        (DATA_DIR / "maps" / "map_24_coneria_castle_2f.json", maps_dir / "coneria_castle_2f.png", "castle"),
        (DATA_DIR / "maps" / "map_12_temple_of_fiends_present.json", maps_dir / "temple_of_fiends.png", "temple"),
        (DATA_DIR / "maps" / "overworld_coneria.json", maps_dir / "overworld_coneria.png", "overworld"),
    ]
    for src_json, dst_png, theme in jobs:
        if src_json.exists():
            _build_single_map_png(src_json, dst_png, theme)


# ---------------------------------------------------------------------------
# 2. CLEAN-ROOM CLASS, NPC, ENEMY & SHOP SPRITE GENERATOR
# ---------------------------------------------------------------------------

CLASS_PALETTES: dict[str, tuple[tuple[int, int, int], tuple[int, int, int], tuple[int, int, int]]] = {
    "fighter": ((216, 52, 44), (244, 196, 148), (168, 178, 196)),
    "thief": ((56, 138, 218), (244, 196, 148), (92, 68, 44)),
    "black_belt": ((196, 118, 48), (244, 196, 148), (42, 42, 52)),
    "red_mage": ((208, 44, 68), (244, 196, 148), (242, 238, 248)),
    "white_mage": ((238, 238, 246), (244, 196, 148), (212, 48, 56)),
    "black_mage": ((48, 76, 196), (32, 28, 44), (228, 184, 52)),
    "knight": ((236, 76, 56), (244, 196, 148), (218, 226, 242)),
    "ninja": ((188, 44, 56), (244, 196, 148), (44, 48, 68)),
    "master": ((232, 164, 56), (244, 196, 148), (242, 242, 248)),
    "red_wizard": ((224, 52, 76), (244, 196, 148), (248, 216, 72)),
    "white_wizard": ((244, 244, 252), (244, 196, 148), (224, 56, 64)),
    "black_wizard": ((72, 96, 224), (44, 36, 62), (244, 198, 68)),
}


def _draw_char_16x16(
    tunic: tuple[int, int, int],
    skin: tuple[int, int, int],
    trim: tuple[int, int, int],
    facing: str = "down",
    hat: bool = False,
) -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    outline = (16, 16, 24, 255)
    # Head / Hat
    if hat:
        d.polygon([(2, 5), (8, 1), (14, 5)], fill=(*trim, 255), outline=outline)
    else:
        d.rectangle([4, 1, 11, 5], fill=(*tunic, 255), outline=outline)
    # Face
    d.rectangle([4, 4, 11, 8], fill=(*skin, 255), outline=outline)
    if facing == "down":
        im.putpixel((6, 6), outline)
        im.putpixel((9, 6), outline)
    elif facing == "side":
        im.putpixel((5, 6), outline)
    # Torso
    d.rectangle([3, 8, 12, 13], fill=(*tunic, 255), outline=outline)
    d.line([(4, 10), (11, 10)], fill=(*trim, 255))
    # Boots
    d.rectangle([4, 13, 7, 15], fill=outline)
    d.rectangle([8, 13, 11, 15], fill=outline)
    return im


def generate_class_and_npc_sprites() -> None:
    cls_dir = ASSETS_DIR / "sprites" / "classes"
    npc_dir = ASSETS_DIR / "sprites" / "npcs"
    cls_dir.mkdir(parents=True, exist_ok=True)
    npc_dir.mkdir(parents=True, exist_ok=True)

    for slug, (tunic, skin, trim) in CLASS_PALETTES.items():
        has_hat = "mage" in slug or "wizard" in slug
        f_down = _draw_char_16x16(tunic, skin, trim, "down", has_hat)
        f_up = _draw_char_16x16(tunic, skin, trim, "up", has_hat)
        f_side = _draw_char_16x16(tunic, skin, trim, "side", has_hat)

        walk = Image.new("RGBA", (48, 16), (0, 0, 0, 0))
        walk.paste(f_down, (0, 0))
        walk.paste(f_up, (16, 0))
        walk.paste(f_side, (32, 0))
        walk.save(cls_dir / f"{slug}_walk.png")

        # 32x48 battle sprite (2x scaled character with weapon in hand)
        battle = Image.new("RGBA", (32, 48), (0, 0, 0, 0))
        scaled = f_side.resize((32, 32), Image.Resampling.NEAREST)
        battle.paste(scaled, (0, 10))
        bd = ImageDraw.Draw(battle)
        bd.rectangle([2, 4, 5, 24], fill=(224, 232, 246, 255), outline=(20, 20, 28, 255))
        battle.save(cls_dir / f"{slug}_battle.png")

    # 28 NPC sprites (gfx_00..gfx_27)
    npc_palettes = [
        ((196, 68, 56), (244, 196, 148), (236, 204, 68)),
        ((64, 142, 216), (244, 196, 148), (196, 208, 224)),
        ((72, 176, 92), (244, 196, 148), (218, 184, 72)),
        ((164, 82, 196), (244, 196, 148), (244, 218, 92)),
        ((224, 168, 48), (244, 196, 148), (248, 244, 220)),
        ((108, 118, 142), (244, 196, 148), (220, 64, 64)),
    ]
    for i in range(30):
        tunic, skin, trim = npc_palettes[i % len(npc_palettes)]
        spr = _draw_char_16x16(tunic, skin, trim, "down", hat=(i % 4 == 3))
        spr.save(npc_dir / f"gfx_{i:02d}.png")

    obj_map = {str(k): (k % 28) for k in range(216)}
    obj_map["2"] = 18   # Garland
    obj_map["3"] = 0    # Princess Sara
    obj_map["18"] = 4   # King of Coneria
    (npc_dir / "obj_to_gfx.json").write_text(json.dumps(obj_map, indent=2), encoding="utf-8")


def _draw_enemy_sprite(slug: str) -> Image.Image:
    is_boss = slug in ("garland", "bikke", "astos", "lich", "kary", "kraken", "tiamat", "chaos")
    sz = (64, 64) if is_boss else (48, 48)
    im = Image.new("RGBA", sz, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w, h = sz

    if slug == "garland":
        # Horned dark-plate knight with broadsword
        d.polygon([(14, 18), (8, 4), (22, 14)], fill=(218, 188, 68, 255), outline=(20, 16, 24, 255))
        d.polygon([(50, 18), (56, 4), (42, 14)], fill=(218, 188, 68, 255), outline=(20, 16, 24, 255))
        d.rectangle([20, 10, 44, 28], fill=(92, 64, 148, 255), outline=(20, 16, 24, 255))
        d.rectangle([24, 17, 29, 21], fill=(248, 64, 64, 255))
        d.rectangle([35, 17, 40, 21], fill=(248, 64, 64, 255))
        d.rectangle([14, 28, 50, 52], fill=(148, 44, 68, 255), outline=(20, 16, 24, 255))
        d.rectangle([6, 16, 12, 50], fill=(212, 220, 236, 255), outline=(20, 16, 24, 255))
        d.rectangle([18, 52, 28, 62], fill=(64, 52, 88, 255), outline=(20, 16, 24, 255))
        d.rectangle([36, 52, 46, 62], fill=(64, 52, 88, 255), outline=(20, 16, 24, 255))
    else:
        # Winged goblin / imp / monster silhouette
        body = (168, 88, 44, 255) if "imp" in slug else (92, 148, 72, 255)
        wing = (124, 52, 96, 255)
        d.polygon([(4, 16), (16, 22), (8, 36)], fill=wing, outline=(20, 16, 24, 255))
        d.polygon([(w - 4, 16), (w - 16, 22), (w - 8, 36)], fill=wing, outline=(20, 16, 24, 255))
        d.ellipse([14, 8, w - 14, h - 10], fill=body, outline=(20, 16, 24, 255))
        d.rectangle([19, 16, 22, 19], fill=(252, 224, 64, 255))
        d.rectangle([w - 22, 16, w - 19, 19], fill=(252, 224, 64, 255))
    return im


def generate_enemy_and_shop_sprites() -> None:
    en_dir = ASSETS_DIR / "sprites" / "enemies"
    sh_dir = ASSETS_DIR / "sprites" / "shops"
    en_dir.mkdir(parents=True, exist_ok=True)
    sh_dir.mkdir(parents=True, exist_ok=True)

    for slug in (
        "imp", "grimp", "wolf", "grwolf", "wrwolf", "frwolf", "iguana", "agx",
        "sauria", "giant", "frgiant", "rgiant", "sahag", "rsahag", "wzrd",
        "pirate", "kyzoku", "shark", "grshark", "bigeye", "bone", "rbone",
        "creep", "crawl", "hyena", "cerebus", "ogre", "grogre", "wzogre",
        "asp", "cobra", "seasnake", "scorp", "lobster", "bull", "zombull",
        "troll", "seatroll", "shadow", "image", "wraith", "ghost", "zombie",
        "ghoul", "geist", "specter", "worm", "sand_w", "lava_w", "eye",
        "phantom", "medusa", "grmedusa", "catman", "mancat", "pedede",
        "grpedede", "tiger", "saber_t", "vampire", "wzvamp", "gargoyle",
        "r_goyle", "earth", "fire", "frost_d", "red_d", "zombie_d", "scum",
        "muck", "ooze", "slime", "spider", "arachnid", "manticor", "sphinx",
        "r_ankylo", "ankylo", "mummy", "wzmummy", "coctrice", "perilisk",
        "wyvern", "wyrm", "tyro", "t_rex", "caribe", "rcaribe", "gator",
        "frgator", "ochu", "neochu", "hydra", "r_hydra", "guard", "sentry",
        "water", "air", "naga", "grnaga", "chimera", "jimera", "wizard",
        "sorcerer", "garland", "gas_d", "blue_d", "mudgol", "rockgol",
        "irongol", "badman", "evilman", "astos", "mage", "fighter", "madpony",
        "nitemare", "warmech", "lich", "lich2", "kary", "kary2", "kraken",
        "kraken2", "tiamat", "tiamat2", "bikke", "chaos",
    ):
        _draw_enemy_sprite(slug).save(en_dir / f"{slug}.png")

    # Shop counters (168x152)
    for fname, rack_col in (("weapon_counter.png", (196, 68, 56, 255)), ("item_counter.png", (64, 156, 112, 255))):
        im = Image.new("RGBA", (168, 152), (12, 16, 36, 255))
        d = ImageDraw.Draw(im)
        d.rectangle([4, 4, 163, 147], outline=(236, 240, 252, 255), width=2)
        # Back shelf displays
        for sx in (18, 66, 114):
            d.rectangle([sx, 16, sx + 34, 52], fill=rack_col, outline=(228, 196, 84, 255))
        # Merchant sprite behind counter
        clerk = _draw_char_16x16((72, 156, 92), (244, 196, 148), (236, 204, 68), "down").resize((48, 48), Image.Resampling.NEAREST)
        im.paste(clerk, (60, 44), clerk)
        # Wooden counter bar
        d.rectangle([12, 92, 155, 128], fill=(156, 96, 42, 255), outline=(244, 208, 124, 255), width=2)
        im.save(sh_dir / fname)

    # White pointing glove cursor (36x32)
    cur = Image.new("RGBA", (36, 32), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cur)
    cd.rectangle([4, 8, 22, 24], fill=(248, 248, 252, 255), outline=(20, 20, 28, 255))
    cd.rectangle([20, 10, 33, 16], fill=(248, 248, 252, 255), outline=(20, 20, 28, 255))
    cur.save(sh_dir / "hand_cursor.png")


# ---------------------------------------------------------------------------
# 3. CHIPTUNE AUDIO SYNTHESIS (MP3) & ICON.SVG
# ---------------------------------------------------------------------------

def _synth_notes_to_wav(notes: list[tuple[float, float, str]], wav_path: Path, sample_rate: int = 22050) -> None:
    samples = bytearray()
    for freq, dur, wtype in notes:
        n_frames = max(1, int(sample_rate * dur))
        for i in range(n_frames):
            t = i / sample_rate
            env = min(1.0, i / 100.0) * max(0.0, 1.0 - (i / n_frames) * 0.35)
            if freq <= 0.0:
                val = 0.0
            elif wtype == "triangle":
                p = (freq * t) % 1.0
                val = (4.0 * p - 1.0 if p < 0.5 else 3.0 - 4.0 * p) * 0.34
            else:
                val = 0.30 if math.sin(2.0 * math.pi * freq * t) >= 0 else -0.30
            s16 = max(-32767, min(32767, int(val * env * 32767)))
            samples += struct.pack("<h", s16)

    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(samples))


def generate_music_and_icon() -> None:
    mus_dir = ASSETS_DIR / "music"
    mus_dir.mkdir(parents=True, exist_ok=True)

    C4, D4, E4, F4, G4, A4, B4 = 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88
    C5, D5, E5, F5, G5 = 523.25, 587.33, 659.25, 698.46, 783.99

    tracks: dict[str, list[tuple[float, float, str]]] = {
        "1_-_the_prelude": [(C4, 0.14, "triangle"), (D4, 0.14, "triangle"), (E4, 0.14, "triangle"), (G4, 0.14, "triangle"), (C5, 0.14, "triangle"), (E5, 0.14, "triangle"), (C5, 0.14, "triangle"), (G4, 0.14, "triangle")] * 3,
        "2_-_opening_theme": [(C4, 0.25, "square"), (G4, 0.25, "square"), (C5, 0.45, "square"), (B4, 0.25, "square"), (A4, 0.25, "square"), (G4, 0.45, "square")] * 2,
        "3_-_cornelia_castle": [(F4, 0.25, "triangle"), (A4, 0.25, "triangle"), (C5, 0.4, "square"), (B4, 0.25, "square"), (G4, 0.4, "triangle")] * 2,
        "4_-_main_theme": [(E4, 0.25, "square"), (G4, 0.25, "square"), (A4, 0.4, "square"), (C5, 0.4, "square"), (B4, 0.3, "triangle"), (G4, 0.45, "triangle")] * 2,
        "5_-_temple_of_chaos": [(D4, 0.22, "triangle"), (F4, 0.22, "triangle"), (A4, 0.35, "square"), (G4, 0.22, "triangle"), (E4, 0.4, "triangle")] * 2,
        "7_-_town": [(G4, 0.25, "triangle"), (B4, 0.25, "triangle"), (D5, 0.35, "triangle"), (C5, 0.25, "triangle"), (B4, 0.4, "triangle")] * 2,
        "8_-_shop": [(C5, 0.18, "square"), (A4, 0.18, "square"), (F4, 0.18, "square"), (G4, 0.32, "square")] * 3,
        "11_-_dungeon": [(E4, 0.28, "triangle"), (F4, 0.28, "triangle"), (D4, 0.4, "triangle")] * 3,
        "12_-_menu_screen": [(A4, 0.2, "triangle"), (C5, 0.2, "triangle"), (E5, 0.35, "triangle")] * 3,
        "16_-_battle_scene": [(E4, 0.12, "square"), (G4, 0.12, "square"), (A4, 0.18, "square"), (B4, 0.12, "square"), (C5, 0.24, "square")] * 4,
        "17_-_victory": [(C5, 0.12, "square"), (C5, 0.12, "square"), (C5, 0.12, "square"), (C5, 0.35, "square"), (G4, 0.22, "square"), (A4, 0.22, "square"), (C5, 0.45, "square")],
        "19_-_dead_music": [(E4, 0.3, "triangle"), (D4, 0.3, "triangle"), (C4, 0.5, "triangle")],
        "20_-_save_music": [(C5, 0.15, "triangle"), (E5, 0.15, "triangle"), (G5, 0.35, "triangle")],
        "22_-_in_the_treasure_chest...": [(G4, 0.14, "square"), (B4, 0.14, "square"), (D5, 0.14, "square"), (G5, 0.35, "square")],
    }

    ffmpeg_bin = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        for name, notes in tracks.items():
            wav_file = tmp / f"{name}.wav"
            mp3_file = mus_dir / f"{name}.mp3"
            _synth_notes_to_wav(notes, wav_file)
            subprocess.run(
                [ffmpeg_bin, "-y", "-loglevel", "error", "-i", str(wav_file), "-codec:a", "libmp3lame", "-qscale:a", "6", str(mp3_file)],
                check=True,
            )

    icon_svg = """<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#0b1536"/>
  <polygon points="32,6 50,26 32,58 14,26" fill="#38bdf8" stroke="#facc15" stroke-width="3"/>
  <polygon points="32,6 42,26 32,58" fill="#0284c7" opacity="0.65"/>
  <circle cx="26" cy="22" r="3" fill="#ffffff"/>
</svg>
"""
    (ROOT / "icon.svg").write_text(icon_svg, encoding="utf-8")


def main() -> None:
    print("[1/4] Generating 5 clean-room 64x64 pixel-art maps from data/maps/*.json...")
    generate_maps()
    print("[2/4] Generating 12 hero classes (walk + battle) and 28 NPC sprites...")
    generate_class_and_npc_sprites()
    print("[3/4] Generating 128 clean-room enemy sprites and 2-step shop counters...")
    generate_enemy_and_shop_sprites()
    print("[4/4] Synthesizing 14 clean-room 8-bit chiptune MP3 tracks & icon.svg...")
    generate_music_and_icon()
    print("Done! All assets in games/fantasy-light-warriors/assets/ are 100% clean-room.")


if __name__ == "__main__":
    main()
