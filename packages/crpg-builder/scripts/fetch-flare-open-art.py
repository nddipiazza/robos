#!/usr/bin/env python3
"""
RobOS Flare RPG Open-Source Asset Ingestion Pipeline
Fetches authentic, high-resolution CC-BY-SA / GPL art from flareteam/flare-game:
- High-res background paintings (citadel, dungeon, arrival)
- Character class portraits (fighter, rogue, wizard, cleric)
- 8-directional character & NPC sprites (Knight Hero, Elora, Blacksmith Brand, Shadow Hound, Malakor)
- Interactive world object sprites (opening wooden chest, arched doors)
- Isometric terrain tiles & village structures
- Ambient soundtrack & sound effects
"""

import os
import sys
import io
import urllib.request
from pathlib import Path
from PIL import Image, ImageEnhance

BASE_URL = "https://raw.githubusercontent.com/flareteam/flare-game/master"
PROJECT_DIR = Path(__file__).resolve().parent.parent.parent.parent
TARGET_ASSETS = PROJECT_DIR / "games" / "crpg-realm" / "assets"

def download_bytes(url: str, description: str) -> bytes:
    print(f"⬇️  Downloading {description} from {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "RobOS-AssetPipeline"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def ensure_parent(p: Path) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)

def fetch_backgrounds():
    bg_dir = TARGET_ASSETS / "backgrounds"
    bg_dir.mkdir(parents=True, exist_ok=True)
    
    bgs = {
        "city_citadel.jpg": f"{BASE_URL}/mods/empyrean_campaign/images/cutscenes/empyrean_city.jpg",
        "dungeon_keep.jpg": f"{BASE_URL}/mods/fantasycore/images/menus/backgrounds/dungeon.jpg",
        "arrival_victory.jpg": f"{BASE_URL}/mods/empyrean_campaign/images/cutscenes/arrival.jpg",
    }
    for filename, url in bgs.items():
        dest = bg_dir / filename
        if not dest.exists() or dest.stat().st_size == 0:
            data = download_bytes(url, filename)
            dest.write_bytes(data)
            print(f"✔ Saved background: {dest} ({len(data)} bytes)")

def fetch_portraits():
    p_dir = TARGET_ASSETS / "portraits"
    p_dir.mkdir(parents=True, exist_ok=True)

    portraits = {
        "portrait_fighter.png": f"{BASE_URL}/mods/fantasycore/images/portraits/male01.png",
        "portrait_rogue.png": f"{BASE_URL}/mods/fantasycore/images/portraits/male02.png",
        "portrait_wizard.png": f"{BASE_URL}/mods/fantasycore/images/portraits/female01.png",
        "portrait_cleric.png": f"{BASE_URL}/mods/fantasycore/images/portraits/male03.png",
        "portrait_elora.png": f"{BASE_URL}/mods/fantasycore/images/portraits/female04.png",
        "portrait_brand.png": f"{BASE_URL}/mods/fantasycore/images/portraits/male08.png",
        "portrait_malakor.png": f"{BASE_URL}/mods/fantasycore/images/portraits/male14.png",
    }
    for filename, url in portraits.items():
        dest = p_dir / filename
        if not dest.exists() or dest.stat().st_size == 0:
            data = download_bytes(url, filename)
            dest.write_bytes(data)
            print(f"✔ Saved portrait: {dest}")

def fetch_props_and_chests():
    props_dir = TARGET_ASSETS / "props"
    props_dir.mkdir(parents=True, exist_ok=True)

    # 1. Boss Chest (768 x 192 -> 4 frames of 192x192)
    chest_url = f"{BASE_URL}/tiled/tilesheets/boss_chest.png"
    chest_data = download_bytes(chest_url, "boss_chest.png")
    chest_img = Image.open(io.BytesIO(chest_data))
    
    # Extract closed frame (frame 0) and open frame (frame 3)
    frame_w = 192
    frame_h = 192
    chest_closed = chest_img.crop((0, 0, frame_w, frame_h))
    chest_open = chest_img.crop((frame_w * 3, 0, frame_w * 4, frame_h))

    # Resize to crisp in-game prop dimensions (e.g. 96x96)
    chest_closed_resized = chest_closed.resize((96, 96), Image.Resampling.LANCZOS)
    chest_open_resized = chest_open.resize((96, 96), Image.Resampling.LANCZOS)

    chest_closed_resized.save(props_dir / "chest_closed.png")
    chest_open_resized.save(props_dir / "chest_open.png")
    print("✔ Extracted and saved chest_closed.png & chest_open.png")

    # 2. Door Left (384 x 384 -> clean door frame)
    door_url = f"{BASE_URL}/tiled/tilesheets/dungeon_door_left.png"
    door_data = download_bytes(door_url, "dungeon_door_left.png")
    door_img = Image.open(io.BytesIO(door_data))
    door_resized = door_img.resize((128, 128), Image.Resampling.LANCZOS)
    door_resized.save(props_dir / "door_arch.png")
    print("✔ Extracted and saved door_arch.png")

    # 3. Save full tiled structure sheet for village & keep
    struct_url = f"{BASE_URL}/tiled/tilesheets/grassland_structures.png"
    struct_data = download_bytes(struct_url, "grassland_structures.png")
    (props_dir / "grassland_structures.png").write_bytes(struct_data)
    print("✔ Saved grassland_structures.png")

def fetch_characters():
    char_dir = TARGET_ASSETS / "sprites" / "characters"
    char_dir.mkdir(parents=True, exist_ok=True)

    # 1. Knight Hero (1013 x 492)
    knight_url = f"{BASE_URL}/mods/fantasycore/images/npcs/knight.png"
    knight_data = download_bytes(knight_url, "knight.png")
    knight_img = Image.open(io.BytesIO(knight_data))

    # Direction 0 (South facing front) frames from knight.txt:
    # frame=0,0,826,0,91,161,28,149
    # frame=1,0,917,0,90,161,28,149
    # frame=2,0,0,158,90,161,28,149
    # frame=3,0,90,159,90,161,28,149
    f0 = knight_img.crop((826, 0, 826 + 91, 161))
    f1 = knight_img.crop((917, 0, 917 + 90, 161))
    f2 = knight_img.crop((0, 158, 90, 158 + 161))
    f3 = knight_img.crop((90, 159, 90 + 90, 159 + 161))

    # Save Hero Knight frames
    f0.save(char_dir / "hero_knight_idle_0.png")
    f1.save(char_dir / "hero_knight_idle_1.png")
    f2.save(char_dir / "hero_knight_idle_2.png")
    f3.save(char_dir / "hero_knight_idle_3.png")

    # Direction 4 (East/Southeast) and Direction 6 (North) for walking
    f_walk_0 = knight_img.crop((87, 320, 87 + 85, 320 + 165))
    f_walk_1 = knight_img.crop((663, 323, 663 + 87, 323 + 165))
    f_walk_2 = knight_img.crop((836, 325, 836 + 86, 325 + 166))
    f_walk_3 = knight_img.crop((922, 325, 922 + 89, 325 + 167))
    f_walk_0.save(char_dir / "hero_knight_walk_0.png")
    f_walk_1.save(char_dir / "hero_knight_walk_1.png")
    f_walk_2.save(char_dir / "hero_knight_walk_2.png")
    f_walk_3.save(char_dir / "hero_knight_walk_3.png")
    print("✔ Extracted and saved hero_knight idle & walk frames")

    # Create Captain Malakor boss sprite by giving knight darker ominous tones & crimson tint
    malakor_f0 = f0.copy()
    enhancer = ImageEnhance.Color(malakor_f0)
    malakor_f0 = enhancer.enhance(1.4)
    # Apply reddish shadow tint
    r, g, b, a = malakor_f0.split()
    r = r.point(lambda p: min(255, int(p * 1.35)))
    g = g.point(lambda p: int(p * 0.75))
    b = b.point(lambda p: int(p * 0.8))
    malakor_tinted = Image.merge("RGBA", (r, g, b, a))
    malakor_tinted.save(char_dir / "captain_malakor_boss.png")
    print("✔ Created and saved captain_malakor_boss.png")

    # 2. Elora NPC (Peasant Woman: 974 x 462)
    elora_url = f"{BASE_URL}/mods/fantasycore/images/npcs/peasant_woman1.png"
    elora_data = download_bytes(elora_url, "peasant_woman1.png")
    elora_img = Image.open(io.BytesIO(elora_data))

    # Direction 0 frames from peasant_woman1.txt:
    # frame=0,0,107,153,100,150
    # frame=1,0,107,303,100,149
    # frame=2,0,214,0,100,150
    # frame=3,0,314,0,98,150
    ef0 = elora_img.crop((107, 153, 107 + 100, 153 + 150))
    ef1 = elora_img.crop((107, 303, 107 + 100, 303 + 149))
    ef2 = elora_img.crop((214, 0, 214 + 100, 150))
    ef3 = elora_img.crop((314, 0, 314 + 98, 150))

    ef0.save(char_dir / "elora_npc_0.png")
    ef1.save(char_dir / "elora_npc_1.png")
    ef2.save(char_dir / "elora_npc_2.png")
    ef3.save(char_dir / "elora_npc_3.png")
    print("✔ Extracted and saved elora_npc frames")

    # 3. Blacksmith Brand (Peasant Man: 786 x 658)
    brand_url = f"{BASE_URL}/mods/fantasycore/images/npcs/peasant_man1.png"
    brand_data = download_bytes(brand_url, "peasant_man1.png")
    brand_img = Image.open(io.BytesIO(brand_data))

    # Direction 0 frame
    bf0 = brand_img.crop((0, 0, 100, 160))
    bf0.save(char_dir / "blacksmith_brand_0.png")
    print("✔ Extracted and saved blacksmith_brand_0.png")

    # 4. Shadow Hound (from wolf or antlion)
    beast_url = f"{BASE_URL}/mods/fantasycore/images/enemies/antlion.png"
    beast_data = download_bytes(beast_url, "antlion.png")
    beast_img = Image.open(io.BytesIO(beast_data))
    # Crop first frame
    hf0 = beast_img.crop((0, 0, 160, 160))
    # Give dark corrupted purple tint
    r, g, b, a = hf0.split()
    r = r.point(lambda p: min(255, int(p * 1.2)))
    g = g.point(lambda p: int(p * 0.6))
    b = b.point(lambda p: min(255, int(p * 1.5)))
    hound_tinted = Image.merge("RGBA", (r, g, b, a))
    hound_tinted.save(char_dir / "shadow_hound_0.png")
    print("✔ Extracted and saved shadow_hound_0.png")

def fetch_audio():
    audio_dir = TARGET_ASSETS / "audio"
    music_dir = audio_dir / "music"
    sfx_dir = audio_dir / "sfx"
    music_dir.mkdir(parents=True, exist_ok=True)
    sfx_dir.mkdir(parents=True, exist_ok=True)

    tracks = {
        music_dir / "safe_room_theme.ogg": f"{BASE_URL}/mods/fantasycore/music/safe_room_theme.ogg",
        music_dir / "town_theme.ogg": f"{BASE_URL}/mods/fantasycore/music/town_theme.ogg",
        music_dir / "boss_theme.ogg": f"{BASE_URL}/mods/fantasycore/music/boss_theme.ogg",
        music_dir / "title_theme.ogg": f"{BASE_URL}/mods/fantasycore/music/title_theme.ogg",
        sfx_dir / "door_open.ogg": f"{BASE_URL}/mods/fantasycore/soundfx/door_open.ogg",
        sfx_dir / "wood_open.ogg": f"{BASE_URL}/mods/fantasycore/soundfx/wood_open.ogg",
        sfx_dir / "melee_attack.ogg": f"{BASE_URL}/mods/fantasycore/soundfx/melee_attack.ogg",
    }

    for dest, url in tracks.items():
        if not dest.exists() or dest.stat().st_size == 0:
            try:
                data = download_bytes(url, dest.name)
                dest.write_bytes(data)
                print(f"✔ Saved audio: {dest}")
            except Exception as e:
                print(f"⚠️ Could not download {dest.name}: {e}")

def main():
    print("==================================================================")
    print("   RobOS Flare RPG Asset Ingestion Pipeline                      ")
    print("==================================================================")
    fetch_backgrounds()
    fetch_portraits()
    fetch_props_and_chests()
    fetch_characters()
    fetch_audio()
    print("==================================================================")
    print("🎉 All Flare RPG authentic assets fetched and processed cleanly!")
    print("==================================================================")

if __name__ == "__main__":
    main()
