#!/usr/bin/env python3
"""
capture_special_furniture_proofs.py
Captures visual screenshots of the Healing Hearth and Sly Storage treasure search modals.
"""

import os
import shutil
import subprocess
import sys
import time
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(GAME_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer

PORT = 18128
BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"


def main():
    play_script = os.path.join(GAME_DIR, "play.sh")
    disp = os.environ.get("DISPLAY", ":0")
    env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT), DISPLAY=disp)
    args = [play_script, "--player"]
    if not os.path.exists("/tmp/.X11-unix"):
        args.append("--headless")
    proc = subprocess.Popen(
        args,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    player = TabletopQAPlayer(port=PORT)

    connected = False
    for _ in range(30):
        if player.check_health():
            connected = True
            break
        time.sleep(0.3)

    if not connected:
        if proc: proc.terminate()
        raise RuntimeError(f"Could not connect to Godot tabletop server on port {PORT}")

    try:
        player.reset_game()
        time.sleep(0.3)

        # 1. Healing Hearth Proof
        print("Capturing Healing Hearth treasure modal...")
        player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "barbarian",
                "characterName": "Barbarian",
                "grid_pos": [4, 3],
                "current_bp": 5,
                "bodyPoints": 8,
                "gold": 0
            }],
            furniture=[{
                "id": "hearth-crypt",
                "type": "healing_hearth",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 3,
                "roomId": "room-nw-crypt"
            }],
            treasureDeck=[{
                "id": "gem-50",
                "type": "gold",
                "title": "50 Gold Gem",
                "gold": 50,
                "description": "You discover an uncut ruby worth 50 gold coins.",
                "flavor": "It gleams with crimson fire in the hearth's glow."
            }],
            monsters=[]
        )

        res = player.search(interactive=True)
        time.sleep(0.5)

        tmp_hearth = "/tmp/hearth_proof.png"
        player.take_screenshot(tmp_hearth)
        brain_hearth_full = os.path.join(BRAIN_DIR, "tabletop_healing_hearth_modal_proof.png")
        brain_hearth_crop = os.path.join(BRAIN_DIR, "tabletop_healing_hearth_modal_crop.png")
        shutil.copyfile(tmp_hearth, brain_hearth_full)

        with Image.open(tmp_hearth) as im:
            w, h = im.size
            scale_x = w / 1920.0
            scale_y = h / 1080.0
            crop_box = (int(580 * scale_x), int(150 * scale_y), int(1470 * scale_x), int(950 * scale_y))
            im.crop(crop_box).save(brain_hearth_crop)
        print(f"Saved: {brain_hearth_full} and {brain_hearth_crop}")

        player.dismiss_treasure_overlay()
        time.sleep(0.3)

        # 2. Sly Storage Proof
        print("Capturing Sly Storage treasure modal...")
        player.set_state(
            activeHero="elf",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "elf",
                "characterName": "Elf",
                "grid_pos": [4, 3],
                "gold": 0
            }],
            furniture=[{
                "id": "sly-chest",
                "type": "sly_storage",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 1,
                "roomId": "room-nw-crypt"
            }],
            treasureDeck=[{
                "id": "potion-defense",
                "type": "potion",
                "item": "potion_of_defense",
                "title": "Potion of Defense",
                "description": "Drink this shimmering tonic at any time to temporarily gain +2 extra Combat Defense dice for one combat turn.",
                "flavor": "Brewed with ground stone and adamant herbs."
            }],
            monsters=[]
        )

        res = player.search(interactive=True)
        time.sleep(0.5)

        tmp_sly = "/tmp/sly_proof.png"
        player.take_screenshot(tmp_sly)
        brain_sly_full = os.path.join(BRAIN_DIR, "tabletop_sly_storage_modal_proof.png")
        brain_sly_crop = os.path.join(BRAIN_DIR, "tabletop_sly_storage_modal_crop.png")
        shutil.copyfile(tmp_sly, brain_sly_full)

        with Image.open(tmp_sly) as im:
            w, h = im.size
            scale_x = w / 1920.0
            scale_y = h / 1080.0
            crop_box = (int(580 * scale_x), int(150 * scale_y), int(1470 * scale_x), int(950 * scale_y))
            im.crop(crop_box).save(brain_sly_crop)
        print(f"Saved: {brain_sly_full} and {brain_sly_crop}")

        player.dismiss_treasure_overlay()
        print("All visual proofs captured successfully!")

    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()


if __name__ == "__main__":
    main()
