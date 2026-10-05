#!/usr/bin/env python3
"""
Capture high-res visual proofs of the newly styled RPG menus and dialogs.
Captures:
1. Game Menu (Dungeon background, stone slab, parchment info, RPG buttons)
2. Elf Spell Selection Modal (Stone slab, elemental deck cards, RPG typography)
3. Armory Modal (Equipment shop, gold badge, item cards)
4. Hero Detail Modal (Character sheet with Cinzel headers and Medieval lore)
"""

import os
import shutil
import subprocess
import sys
import time
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer

PORT = 18139
play_script = os.path.join(ROOT_DIR, "play.sh")
env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT))

proc = subprocess.Popen(
    ["xvfb-run", "--auto-servernum", play_script, "--role=player", "--reset"],
    env=env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)

artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"

try:
    ai = TabletopQAPlayer(port=PORT, human_delay=0.1)
    if not ai.wait_for_ready(timeout=16.0):
        raise RuntimeError("Godot failed to start")

    time.sleep(1.0)

    # 1. Capture Elf Spell Selection Modal (Fresh quest_begin)
    out_elf = "/tmp/tabletop_rpg_elf_spell_modal.png"
    ai.take_screenshot(out_elf)
    print(f"Captured {out_elf}")

    # Select water and confirm to proceed
    ai.select_elf_element("water", confirm=True)
    time.sleep(0.5)

    # 2. Open and Capture Armory Modal
    ai.execute_action("open_armory", heroId="barbarian")
    time.sleep(0.5)
    out_armory = "/tmp/tabletop_rpg_armory_modal.png"
    ai.take_screenshot(out_armory)
    print(f"Captured {out_armory}")

    # Close armory
    ai.execute_action("close_armory")
    time.sleep(0.4)

    # 3. Capture Game Menu Modal
    ai.open_game_menu()
    time.sleep(0.5)
    out_menu = "/tmp/tabletop_rpg_game_menu.png"
    ai.take_screenshot(out_menu)
    print(f"Captured {out_menu}")

    # Close game menu
    ai.close_game_menu()
    time.sleep(0.4)

    # 4. Capture Quest Objective Modal
    ai.execute_action("open_quest_objective")
    time.sleep(0.5)
    out_quest_obj = "/tmp/tabletop_rpg_quest_objective_modal.png"
    ai.take_screenshot(out_quest_obj)
    print(f"Captured {out_quest_obj}")

    # Close quest objective
    ai.execute_action("close_quest_objective")
    time.sleep(0.4)

    # 5. Open Hero Detail Modal for Rogar the Barbarian
    ai.execute_action("open_hero_detail", heroId="barbarian")
    time.sleep(0.5)
    out_hero = "/tmp/tabletop_rpg_hero_sheet.png"
    ai.take_screenshot(out_hero)
    print(f"Captured {out_hero}")

    # Close hero detail
    ai.execute_action("close_hero_detail")
    time.sleep(0.4)

    # 6. Open Monster Detail Modal for an enemy (Verag)
    ai.execute_action("open_monster_detail", monsterId="verag")
    time.sleep(0.5)
    out_monster = "/tmp/tabletop_rpg_monster_sheet.png"
    ai.take_screenshot(out_monster)
    print(f"Captured {out_monster}")

    # Close monster detail
    ai.execute_action("close_monster_detail")
    time.sleep(0.4)

    # Process and crop images
    screenshots = [
        (out_elf, "tabletop_rpg_elf_spell_modal.png", "tabletop_rpg_elf_spell_crop.png", (450, 150, 1470, 930)),
        (out_armory, "tabletop_rpg_armory_modal.png", "tabletop_rpg_armory_crop.png", (450, 140, 1470, 940)),
        (out_menu, "tabletop_rpg_game_menu.png", "tabletop_rpg_game_menu_crop.png", (660, 310, 1260, 770)),
        (out_quest_obj, "tabletop_quest_objective_modal.png", "tabletop_quest_objective_crop.png", (640, 260, 1280, 820)),
        (out_hero, "tabletop_rpg_hero_sheet.png", "tabletop_rpg_hero_sheet_crop.png", (450, 150, 1470, 930)),
        (out_monster, "tabletop_rpg_monster_sheet.png", "tabletop_rpg_monster_sheet_crop.png", (450, 150, 1470, 930))
    ]

    for full_src, full_name, crop_name, crop_box in screenshots:
        if os.path.exists(full_src):
            dst_full = os.path.join(artifact_dir, full_name)
            shutil.copyfile(full_src, dst_full)
            print(f"Saved {full_name} ({os.path.getsize(dst_full)} bytes)")

            # Crop
            im = Image.open(full_src)
            cropped = im.crop(crop_box)
            dst_crop = os.path.join(artifact_dir, crop_name)
            cropped.save(dst_crop)
            print(f"Saved {crop_name} ({os.path.getsize(dst_crop)} bytes)")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=3.0)
    except Exception:
        proc.kill()
