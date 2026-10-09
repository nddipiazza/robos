#!/usr/bin/env python3
"""
Capture high-res visual proofs of the Quest Objectives HUD and Complete Quest button.
Captures:
1. Quest Objectives HUD during normal quest exploration (pending objectives).
2. Quest Objectives HUD with all objectives completed, displaying the glowing "🏆 COMPLETE QUEST" button.
3. Quest Objective Modal with all objectives completed, displaying the "🏆 COMPLETE QUEST" button.
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

PORT = 18149
play_script = os.path.join(ROOT_DIR, "play.sh")
temp_save = "/tmp/tabletop_hud_capture_save.json"
if os.path.exists(temp_save):
    try:
        os.remove(temp_save)
    except Exception:
        pass

env = dict(
    os.environ,
    TABLETOP_SERVER_PORT=str(PORT),
    TABLETOP_SAVE_PATH=temp_save
)

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

    # If elf spell modal is open, select water to start quest
    st = ai.get_state()
    if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
        ai.select_elf_element("water", confirm=True)
        time.sleep(0.5)

    # 1. Capture Quest Objectives HUD in initial state
    out_hud_initial = "/tmp/tabletop_quest_objectives_hud_initial.png"
    ai.take_screenshot(out_hud_initial)
    print(f"Captured {out_hud_initial}")

    # Crop to top-left HUD area
    im = Image.open(out_hud_initial)
    crop_hud_initial = im.crop((10, 10, 420, 260))
    out_crop_initial = "/tmp/tabletop_quest_objectives_hud_initial_crop.png"
    crop_hud_initial.save(out_crop_initial)

    # 2. Patch state so all quest objectives are complete
    ai.execute_action("patch_state", revealed_rooms=["room-nw-crypt"])
    st = ai.get_state()
    patch_monsters = []
    for m in st.get("monsters", []):
        m_copy = dict(m)
        m_copy["current_bp"] = 0
        m_copy["is_alive"] = False
        patch_monsters.append(m_copy)
    ai.execute_action("patch_state", monsters=patch_monsters)
    time.sleep(0.5)

    # Capture Quest Objectives HUD with Complete Quest button visible
    out_hud_complete = "/tmp/tabletop_quest_objectives_hud_complete.png"
    ai.take_screenshot(out_hud_complete)
    print(f"Captured {out_hud_complete}")

    im2 = Image.open(out_hud_complete)
    crop_hud_complete = im2.crop((10, 10, 420, 310))
    out_crop_complete = "/tmp/tabletop_quest_objectives_hud_complete_crop.png"
    crop_hud_complete.save(out_crop_complete)

    # 3. Open Quest Objective Modal and capture with Complete Quest button visible
    ai.execute_action("open_quest_objective")
    time.sleep(0.5)

    out_modal_complete = "/tmp/tabletop_quest_objective_modal_complete.png"
    ai.take_screenshot(out_modal_complete)
    print(f"Captured {out_modal_complete}")

    im3 = Image.open(out_modal_complete)
    w, h = im3.size
    crop_modal_complete = im3.crop((int(w * 0.18), int(h * 0.1), int(w * 0.82), int(h * 0.9)))
    out_crop_modal = "/tmp/tabletop_quest_objective_modal_complete_crop.png"
    crop_modal_complete.save(out_crop_modal)

    # Copy files to artifact dir
    files_to_copy = [
        out_hud_initial,
        out_crop_initial,
        out_hud_complete,
        out_crop_complete,
        out_modal_complete,
        out_crop_modal
    ]
    for f in files_to_copy:
        dest = os.path.join(artifact_dir, os.path.basename(f))
        shutil.copyfile(f, dest)
        print(f"Copied {f} -> {dest}")

finally:
    try:
        proc.terminate()
        proc.wait(timeout=2.0)
    except Exception:
        pass
    if os.path.exists(temp_save):
        try:
            os.remove(temp_save)
        except Exception:
            pass
    # Restore cartridge file if it was altered
    subprocess.run(["git", "checkout", "--", "games/tabletop-rpg/cartridges/heroquest-the-trial.cartridge.json"], cwd=ROOT_DIR)
