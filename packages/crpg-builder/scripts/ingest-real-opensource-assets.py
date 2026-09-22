#!/usr/bin/env python3
"""
RobOS Asset Ingestion Pipeline - Real Open-Source Assets
Replaces all procedural and grid-of-dot placeholder graphics in games/crpg-realm/assets
with authentic, licensed open-source graphics (CC-BY-SA 3.0 / CC-BY-SA 4.0 / CC0 / GPL)
from Flare RPG (flareteam/flare-game) and OpenGameArt (Danimal / Micket / Poss).
"""

import io
import os
import urllib.request
from pathlib import Path
from PIL import Image

BASE_FLARE = "https://raw.githubusercontent.com/flareteam/flare-game/master"
PROJECT_DIR = Path(__file__).resolve().parent.parent.parent.parent
TARGET_ASSETS = PROJECT_DIR / "games" / "crpg-realm" / "assets"

def download_bytes(url: str, description: str) -> bytes:
    print(f"⬇️  Downloading {description} from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "RobOS-AssetPipeline"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read()

def download_img(url: str, description: str) -> Image.Image:
    data = download_bytes(url, description)
    return Image.open(io.BytesIO(data))

def ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. ENEMY CREATURE SPRITES
# ---------------------------------------------------------------------------
def ingest_enemy_sprites():
    print("\n--- 1. Ingesting Enemy Creature Sprites ---")
    enemies_dir = TARGET_ASSETS / "sprites" / "enemies"
    enemies_dir.mkdir(parents=True, exist_ok=True)

    # 1.1 Wolf: From Danimal / Micket / Poss (CC-BY-SA 4.0 / CC0 on OpenGameArt)
    wolf_dest = enemies_dir / "wolf.png"
    wolf_cache = Path("/tmp/wolfs/Wolf_black.png")
    if not wolf_cache.exists():
        import py7zr
        url = "https://opengameart.org/sites/default/files/wolfs.7z"
        data = download_bytes(url, "wolfs.7z")
        os.makedirs("/tmp/wolfs", exist_ok=True)
        with py7zr.SevenZipFile(io.BytesIO(data), mode="r") as archive:
            archive.extract(path="/tmp/wolfs")

    wolf_sheet = Image.open(wolf_cache)
    # Row 7 is South-West facing stalk with glowing red eyes
    w7 = wolf_sheet.crop((0, 7 * 128, 128, 8 * 128))
    w_box = w7.getbbox()
    w_tight = w7.crop(w_box)
    scale = 2.2
    tw, th = int(w_tight.width * scale), int(w_tight.height * scale)
    w_scaled = w_tight.resize((tw, th), Image.Resampling.LANCZOS)
    wolf_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    wolf_canvas.paste(w_scaled, ((160 - tw) // 2, 145 - th), w_scaled)
    wolf_canvas.save(wolf_dest)
    print(f"✔ Saved authentic Wolf sprite: {wolf_dest} (160x160)")

    # 1.2 Skeleton Warrior / Archer
    skel_dest = enemies_dir / "skeleton.png"
    skel_sheet = download_img(f"{BASE_FLARE}/mods/fantasycore/images/enemies/skeleton.png", "skeleton.png")
    # Direction 0 stance: x=805, y=367, w=162, h=170
    skel_f = skel_sheet.crop((805, 367, 805 + 162, 367 + 170))
    s_box = skel_f.getbbox()
    skel_tight = skel_f.crop(s_box)
    scale = min(150 / skel_tight.height, 140 / skel_tight.width)
    tw, th = int(skel_tight.width * scale), int(skel_tight.height * scale)
    skel_scaled = skel_tight.resize((tw, th), Image.Resampling.LANCZOS)
    skel_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    skel_canvas.paste(skel_scaled, ((160 - tw) // 2, 148 - th), skel_scaled)
    skel_canvas.save(skel_dest)
    print(f"✔ Saved authentic Skeleton sprite: {skel_dest} (160x160)")

    # 1.3 Orc / Hobgoblin Berserker
    orc_dest = enemies_dir / "orc.png"
    orc_sheet = download_img(f"{BASE_FLARE}/mods/empyrean_campaign/images/enemies/hobgoblin.png", "hobgoblin.png")
    # Direction 0 stance: x=956, y=128, w=83, h=91
    orc_f = orc_sheet.crop((956, 128, 956 + 83, 128 + 91))
    o_box = orc_f.getbbox()
    orc_tight = orc_f.crop(o_box)
    scale = min(145 / orc_tight.height, 140 / orc_tight.width)
    tw, th = int(orc_tight.width * scale), int(orc_tight.height * scale)
    orc_scaled = orc_tight.resize((tw, th), Image.Resampling.LANCZOS)
    orc_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    orc_canvas.paste(orc_scaled, ((160 - tw) // 2, 148 - th), orc_scaled)
    orc_canvas.save(orc_dest)
    print(f"✔ Saved authentic Orc sprite: {orc_dest} (160x160)")

    # 1.4 Goblin Scout
    gob_dest = enemies_dir / "goblin.png"
    gob_sheet = download_img(f"{BASE_FLARE}/mods/fantasycore/images/enemies/goblin.png", "goblin.png")
    # Direction 0 stance: x=142, y=977, w=111, h=96
    gob_f = gob_sheet.crop((142, 977, 142 + 111, 977 + 96))
    g_box = gob_f.getbbox()
    gob_tight = gob_f.crop(g_box)
    scale = min(130 / gob_tight.height, 130 / gob_tight.width)
    tw, th = int(gob_tight.width * scale), int(gob_tight.height * scale)
    gob_scaled = gob_tight.resize((tw, th), Image.Resampling.LANCZOS)
    gob_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    gob_canvas.paste(gob_scaled, ((160 - tw) // 2, 145 - th), gob_scaled)
    gob_canvas.save(gob_dest)
    print(f"✔ Saved authentic Goblin sprite: {gob_dest} (160x160)")

    # 1.5 Zombie Shambler
    zom_dest = enemies_dir / "zombie.png"
    zom_sheet = download_img(f"{BASE_FLARE}/mods/fantasycore/images/enemies/zombie.png", "zombie.png")
    # Direction 0 stance: x=1955, y=519, w=77, h=166
    zom_f = zom_sheet.crop((1955, 519, 1955 + 77, 519 + 166))
    z_box = zom_f.getbbox()
    zom_tight = zom_f.crop(z_box)
    scale = min(148 / zom_tight.height, 140 / zom_tight.width)
    tw, th = int(zom_tight.width * scale), int(zom_tight.height * scale)
    zom_scaled = zom_tight.resize((tw, th), Image.Resampling.LANCZOS)
    zom_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    zom_canvas.paste(zom_scaled, ((160 - tw) // 2, 148 - th), zom_scaled)
    zom_canvas.save(zom_dest)
    print(f"✔ Saved authentic Zombie sprite: {zom_dest} (160x160)")

    # 1.6 Minotaur Warden
    mino_dest = enemies_dir / "minotaur.png"
    mino_sheet = download_img(f"{BASE_FLARE}/mods/fantasycore/images/enemies/minotaur/minotaur_stance.png", "minotaur_stance.png")
    # Direction 0 stance: x=0, y=1092, w=157, h=248
    mino_f = mino_sheet.crop((0, 1092, 157, 1092 + 248))
    m_box = mino_f.getbbox()
    mino_tight = mino_f.crop(m_box)
    scale = min(155 / mino_tight.height, 150 / mino_tight.width)
    tw, th = int(mino_tight.width * scale), int(mino_tight.height * scale)
    mino_scaled = mino_tight.resize((tw, th), Image.Resampling.LANCZOS)
    mino_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    mino_canvas.paste(mino_scaled, ((160 - tw) // 2, 150 - th), mino_scaled)
    mino_canvas.save(mino_dest)
    print(f"✔ Saved authentic Minotaur sprite: {mino_dest} (160x160)")

# ---------------------------------------------------------------------------
# 2. CLASS PORTRAITS
# ---------------------------------------------------------------------------
def ingest_portraits():
    print("\n--- 2. Ingesting Class Portraits ---")
    p_dir = TARGET_ASSETS / "portraits"
    p_dir.mkdir(parents=True, exist_ok=True)

    mapping = {
        "portrait_barbarian.png": "male04.png",
        "portrait_paladin.png": "female03.png",
        "portrait_ranger.png": "female02.png",
        "portrait_monk.png": "male07.png",
        "portrait_warlock.png": "female05.png",
        "portrait_bard.png": "male06.png",
        "portrait_druid.png": "female06.png",
        "portrait_sorcerer.png": "female07.png",
    }

    for p_name, flare_file in mapping.items():
        dest = p_dir / p_name
        im = download_img(f"{BASE_FLARE}/mods/fantasycore/images/portraits/{flare_file}", flare_file)
        im = im.resize((320, 320), Image.Resampling.LANCZOS)
        im.save(dest)
        print(f"✔ Saved authentic portrait: {dest} (320x320)")

# ---------------------------------------------------------------------------
# 3. WEAPON, ARMOR, POTION, SCROLL & SPELL ICONS
# ---------------------------------------------------------------------------
def ingest_icons():
    print("\n--- 3. Ingesting Weapon, Armor, Potion, Scroll & Spell Icons ---")
    master = download_img(f"{BASE_FLARE}/mods/fantasycore/images/icons/icons.png", "master icons.png")

    # Item icons are 64x64 at y >= 512
    # Grid: 8 columns of 64x64 (512 / 64 = 8)
    def crop_item_icon(col: int, row_64: int) -> Image.Image:
        x = col * 64
        y = 512 + row_64 * 64
        cell = master.crop((x, y, x + 64, y + 64))
        # Downsample to 32x32 using LANCZOS for clean pixel fidelity in Godot
        return cell.resize((32, 32), Image.Resampling.LANCZOS)

    # Spell/Skill icons are 32x32 at y < 512
    # Grid: 16 columns of 32x32 (512 / 32 = 16)
    def crop_spell_icon(col: int, row_32: int) -> Image.Image:
        x = col * 32
        y = row_32 * 32
        return master.crop((x, y, x + 32, y + 32))

    icon_mapping = {
        # Weapons (row_64 from y=512)
        # y=768 is row_64 = 4: col 0=dagger, 1=shortsword, 2=longsword, 3=greatsword
        TARGET_ASSETS / "icons" / "weapons" / "dagger.png": crop_item_icon(0, 4),
        TARGET_ASSETS / "icons" / "weapons" / "shortsword.png": crop_item_icon(1, 4),
        TARGET_ASSETS / "icons" / "weapons" / "longsword.png": crop_item_icon(2, 4),
        TARGET_ASSETS / "icons" / "weapons" / "greatsword.png": crop_item_icon(3, 4),
        # y=832 is row_64 = 5: col 0=staff, col 7=mace
        TARGET_ASSETS / "icons" / "weapons" / "quarterstaff.png": crop_item_icon(0, 5),
        TARGET_ASSETS / "icons" / "weapons" / "mace.png": crop_item_icon(7, 5),
        # y=896 is row_64 = 6: col 1=shortbow
        TARGET_ASSETS / "icons" / "weapons" / "shortbow.png": crop_item_icon(1, 6),

        # Armor (row_64 from y=512)
        # y=960 is row_64 = 7: col 2=kite shield
        TARGET_ASSETS / "icons" / "armor" / "shield.png": crop_item_icon(2, 7),
        # y=1088 is row_64 = 9: col 1=cloth chest (robe)
        TARGET_ASSETS / "icons" / "armor" / "robe.png": crop_item_icon(1, 9),
        # y=1152 is row_64 = 10: col 1=leather chest
        TARGET_ASSETS / "icons" / "armor" / "leather_armor.png": crop_item_icon(1, 10),
        # y=1216 is row_64 = 11: col 1=chain chest
        TARGET_ASSETS / "icons" / "armor" / "chain_mail.png": crop_item_icon(1, 11),
        # y=1280 is row_64 = 12: col 1=plate chest
        TARGET_ASSETS / "icons" / "armor" / "plate_armor.png": crop_item_icon(1, 12),

        # Potions & Scrolls
        # y=512 is row_64 = 0: col 0=hp potion, col 1=mp potion
        TARGET_ASSETS / "icons" / "potions" / "potion_healing.png": crop_item_icon(0, 0),
        TARGET_ASSETS / "icons" / "potions" / "potion_mana.png": crop_item_icon(1, 0),
        # y=576 is row_64 = 1: col 2=scroll
        TARGET_ASSETS / "icons" / "scrolls" / "scroll_magic_missile.png": crop_item_icon(2, 1),

        # Spells (row_32 in y < 512)
        # Row 0 (y=0): Col 2 = magic staff/channel, Col 4 = shield
        TARGET_ASSETS / "icons" / "spells" / "shield.png": crop_spell_icon(4, 0),
        # Row 1 (y=32): Col 3 = cure wounds (heart + cross)
        TARGET_ASSETS / "icons" / "spells" / "cure_wounds.png": crop_spell_icon(3, 1),
        # Row 3 (y=96): Col 0 = freeze, Col 2 = sleep/stun
        TARGET_ASSETS / "icons" / "spells" / "sleep.png": crop_spell_icon(2, 3),
        # Row 4 (y=128): Col 2 = fireball, Col 3 = magic missile, Col 5 = burning hands
        TARGET_ASSETS / "icons" / "spells" / "fireball.png": crop_spell_icon(2, 4),
        TARGET_ASSETS / "icons" / "spells" / "magic_missile.png": crop_spell_icon(3, 4),
        TARGET_ASSETS / "icons" / "spells" / "burning_hands.png": crop_spell_icon(5, 4),
    }

    for path, img in icon_mapping.items():
        ensure_parent(path)
        img.save(path)
        print(f"✔ Saved authentic icon: {path.name} (32x32)")

# ---------------------------------------------------------------------------
# 4. HERO CLASS SPRITES
# ---------------------------------------------------------------------------
def ingest_hero_sprites():
    print("\n--- 4. Ingesting Hero Class Sprites ---")
    char_dir = TARGET_ASSETS / "sprites" / "characters"
    char_dir.mkdir(parents=True, exist_ok=True)

    # 4.1 Plate Knight (hero_plate.png)
    knight_img = download_img(f"{BASE_FLARE}/mods/fantasycore/images/npcs/knight.png", "knight.png")
    kf = knight_img.crop((0, 0, 110, 165))
    k_box = kf.getbbox()
    kf_tight = kf.crop(k_box)
    plate_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    tw, th = int(kf_tight.width * 0.95), int(kf_tight.height * 0.95)
    kf_scaled = kf_tight.resize((tw, th), Image.Resampling.LANCZOS)
    plate_canvas.paste(kf_scaled, ((160 - tw) // 2, 148 - th), kf_scaled)
    plate_canvas.save(char_dir / "hero_plate.png")
    print(f"✔ Saved authentic hero_plate.png: {char_dir / 'hero_plate.png'}")

    # 4.2 Mage / Wizard (hero_mage.png)
    trader_img = download_img(f"{BASE_FLARE}/mods/fantasycore/images/npcs/wandering_trader.png", "wandering_trader.png")
    tf = trader_img.crop((0, 0, 110, 165))
    t_box = tf.getbbox()
    tf_tight = tf.crop(t_box)
    mage_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    tw, th = int(tf_tight.width * 0.95), int(tf_tight.height * 0.95)
    tf_scaled = tf_tight.resize((tw, th), Image.Resampling.LANCZOS)
    mage_canvas.paste(tf_scaled, ((160 - tw) // 2, 148 - th), tf_scaled)
    mage_canvas.save(char_dir / "hero_mage.png")
    print(f"✔ Saved authentic hero_mage.png: {char_dir / 'hero_mage.png'}")

    # 4.3 Rogue (hero_rogue.png)
    rogue_img = download_img(f"{BASE_FLARE}/mods/fantasycore/images/npcs/peasant_man1.png", "peasant_man1.png")
    rf = rogue_img.crop((0, 0, 100, 160))
    r_box = rf.getbbox()
    rf_tight = rf.crop(r_box)
    rogue_canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    tw, th = int(rf_tight.width * 0.95), int(rf_tight.height * 0.95)
    rf_scaled = rf_tight.resize((tw, th), Image.Resampling.LANCZOS)
    rogue_canvas.paste(rf_scaled, ((160 - tw) // 2, 148 - th), rf_scaled)
    rogue_canvas.save(char_dir / "hero_rogue.png")
    print(f"✔ Saved authentic hero_rogue.png: {char_dir / 'hero_rogue.png'}")

# ---------------------------------------------------------------------------
# 5. TILES & PROPS
# ---------------------------------------------------------------------------
def ingest_tiles_and_props():
    print("\n--- 5. Ingesting Tiles & Props ---")
    tiles_dir = TARGET_ASSETS / "tiles"
    props_dir = TARGET_ASSETS / "props"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    props_dir.mkdir(parents=True, exist_ok=True)

    # 5.1 Dungeon Stone Tile
    dungeon_tileset = Image.open(TARGET_ASSETS / "tilesets" / "dungeon.png")
    # Sample flagstone tile diamond (64x32) at (128, 64)
    dungeon_tile = dungeon_tileset.crop((128, 64, 128 + 64, 64 + 32))
    dungeon_tile.save(tiles_dir / "dungeon_stone.png")
    print(f"✔ Saved authentic dungeon_stone tile: {tiles_dir / 'dungeon_stone.png'}")

    # 5.2 Wilderness Grass Tile
    grass_tileset = Image.open(TARGET_ASSETS / "tilesets" / "grassland.png")
    # Sample grass tile diamond (64x32) at (128, 64)
    grass_tile = grass_tileset.crop((128, 64, 128 + 64, 64 + 32))
    grass_tile.save(tiles_dir / "wilderness_grass.png")
    print(f"✔ Saved authentic wilderness_grass tile: {tiles_dir / 'wilderness_grass.png'}")

    # 5.3 Click / Attack Reticle
    reticle_img = download_img(f"{BASE_FLARE}/mods/fantasycore/images/cursors/cursor_attack.png", "cursor_attack.png")
    reticle_scaled = reticle_img.resize((32, 32), Image.Resampling.LANCZOS)
    reticle_scaled.save(props_dir / "click_reticle.png")
    print(f"✔ Saved authentic attack reticle: {props_dir / 'click_reticle.png'}")

def main():
    print("==================================================================")
    print("   RobOS Open-Source Authentic Game Asset Ingestion Pipeline     ")
    print("==================================================================")
    ingest_enemy_sprites()
    ingest_portraits()
    ingest_icons()
    ingest_hero_sprites()
    ingest_tiles_and_props()
    print("==================================================================")
    print("🎉 All placeholder graphics successfully replaced with real art! ")
    print("==================================================================")

if __name__ == "__main__":
    main()
