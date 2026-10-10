#!/usr/bin/env python3
"""
capture_trial_dread_spells_proof.py
Captures visual screenshot of Tabletop RPG with The Trial Verag casting dread spells
and displaying AI decision & targeting command logs.
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

PORT = 18133
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
        player.execute_action("close_spell_selection")
        time.sleep(0.2)

        print("Setting difficulty to hard...")
        player.set_difficulty("hard")

        print("Configuring Verag with dread spells and heroes (Barbarian & Wizard)...")
        player.set_state(
            current_phase="gm_phase",
            difficulty_mode="hard",
            revealedRooms=["room-center-throne"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 5],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "class": "barbarian"
                },
                {
                    "id": "wizard",
                    "characterName": "Telor",
                    "name": "Wizard",
                    "grid_pos": [5, 4],
                    "is_on_board": True,
                    "current_bp": 2,
                    "bodyPoints": 4,
                    "class": "wizard"
                }
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 4],
                    "movementSquares": 0,
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "isSpellcaster": True,
                    "spells": ["firestorm", "sleep-dread", "lightning-bolt", "cloud-of-chaos"],
                    "used_spells": [],
                    "is_alive": True,
                    "roomId": "room-center-throne"
                }
            ],
            clearMonsters=True
        )
        time.sleep(0.4)

        print("Verag executing monster turn with AI spell decision...")
        res = player.execute_monster_action("mon-verag")
        print(f"Monster action result: {res}")
        time.sleep(0.6)

        out_full = "/tmp/tabletop_trial_dread_spells_proof.png"
        player.take_screenshot(out_full)
        time.sleep(0.4)

        if os.path.exists(out_full) and os.path.getsize(out_full) > 5000:
            dest_full = os.path.join(BRAIN_DIR, "tabletop_trial_dread_spells_proof.png")
            shutil.copyfile(out_full, dest_full)
            print(f"Copied full proof to {dest_full}")

            try:
                img = Image.open(out_full)
                w, h = img.size
                # Combat / command log is positioned at the bottom right
                left = int(w * 0.72)
                top = int(h * 0.64)
                right = int(w * 0.99)
                bottom = int(h * 0.99)
                crop_img = img.crop((left, top, right, bottom))
                dest_crop = os.path.join(BRAIN_DIR, "tabletop_trial_dread_spells_log_crop.png")
                crop_img.save(dest_crop)
                print(f"Saved cropped combat log to {dest_crop}")
            except Exception as e:
                print(f"Error cropping screenshot: {e}")
        else:
            print("Failed to capture valid screenshot")

    finally:
        try:
            player.execute_action("delete_save_game")
            player.execute_action("reset_game")
        except Exception:
            pass
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        print("Done.")


if __name__ == "__main__":
    main()
