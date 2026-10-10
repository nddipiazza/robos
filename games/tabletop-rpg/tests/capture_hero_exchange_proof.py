#!/usr/bin/env python3
"""
capture_hero_exchange_proof.py
Captures visual screenshot of the Hero Backpack Modal displaying adjacent hero pass buttons.
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

PORT = 18129
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
    for _ in range(40):
        if player.check_health():
            connected = True
            break
        time.sleep(0.3)

    if not connected:
        if proc:
            proc.terminate()
        raise RuntimeError(f"Could not connect to Godot tabletop server on port {PORT}")

    try:
        player.reset_game()
        time.sleep(0.3)

        print("Configuring adjacent heroes (Barbarian & Dwarf)...")
        player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "inventory": ["healing_potion", "orc_cleaver", "broadsword"],
                    "gold": 150
                },
                {
                    "id": "dwarf",
                    "characterName": "Dorgan",
                    "name": "Dwarf",
                    "grid_pos": [4, 4],
                    "is_on_board": True,
                    "current_bp": 7,
                    "bodyPoints": 7,
                    "inventory": ["tool_kit"],
                    "gold": 50
                }
            ],
            monsters=[]
        )
        time.sleep(0.3)

        print("Opening backpack inventory modal...")
        player.open_item_panel()
        time.sleep(0.6)

        out_full = "/tmp/tabletop_hero_exchange_proof.png"
        player.take_screenshot(out_full)
        time.sleep(0.4)

        if os.path.exists(out_full) and os.path.getsize(out_full) > 5000:
            dest_full = os.path.join(BRAIN_DIR, "tabletop_hero_exchange_modal_proof.png")
            shutil.copyfile(out_full, dest_full)
            print(f"Copied full proof to {dest_full}")

            try:
                img = Image.open(out_full)
                w, h = img.size
                # Item modal is centered
                left = int(w * 0.18)
                top = int(h * 0.12)
                right = int(w * 0.82)
                bottom = int(h * 0.88)
                crop_img = img.crop((left, top, right, bottom))
                dest_crop = os.path.join(BRAIN_DIR, "tabletop_hero_exchange_modal_crop.png")
                crop_img.save(dest_crop)
                print(f"Saved cropped modal proof to {dest_crop}")
            except Exception as e:
                print(f"Error cropping screenshot: {e}")
        else:
            print("Failed to capture valid screenshot")

    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()


if __name__ == "__main__":
    main()
