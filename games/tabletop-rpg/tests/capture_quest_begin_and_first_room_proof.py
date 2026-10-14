#!/usr/bin/env python3
"""
Capture high-res visual proofs for:
1. Quest Objectives center dialog appearing at quest begin.
2. First chamber (room-nw-1) revealed & visible, floating HUD removed from board, and Objectives button on toolbar hotbar.
3. Hero traversing inside the first chamber.
"""

import os
import shutil
import subprocess
import sys
import time

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer

PORT = 18198
play_script = os.path.join(ROOT_DIR, "play.sh")
temp_save = "/tmp/tabletop_proof_capture_save.json"
if os.path.exists(temp_save):
    try:
        os.remove(temp_save)
    except Exception:
        pass

env = dict(
    os.environ,
    TABLETOP_SERVER_PORT=str(PORT),
    TABLETOP_SAVE_PATH=temp_save,
    TABLETOP_FORCE_QUEST_OBJECTIVE_MODAL="1",
    TABLETOP_RESET="1"
)

cmd = [
    "xvfb-run", "--auto-servernum",
    play_script,
    "5",  # simple-dialogue-quest
    "--role=player"
]

proc = subprocess.Popen(
    cmd,
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

    # 1. Capture Quest Objective center dialog at quest begin
    out_modal = "/tmp/proof_quest_objective_center_dialog_at_start.png"
    ai.take_screenshot(out_modal)
    print(f"Captured {out_modal}")

    # 2. Dismiss modal so board and starting room are visible
    ai.close_quest_objective()
    time.sleep(0.5)

    # Confirm Elf spell selection so dungeon board and hotbar are completely clear
    st = ai.get_state()
    if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
        ai.select_elf_element("water", confirm=True)
        time.sleep(0.5)

    out_board = "/tmp/proof_starting_room_revealed_and_toolbar.png"
    ai.take_screenshot(out_board)
    print(f"Captured {out_board}")

    # 3. Roll movement and advance hero inside starting chamber
    roll_res = ai.roll_movement()
    print(f"Rolled movement: {roll_res}")
    time.sleep(0.5)
    step_res = ai.move(4, 2)
    print(f"Stepped hero: {step_res}")
    time.sleep(0.5)

    out_traverse = "/tmp/proof_hero_traversing_first_room.png"
    ai.take_screenshot(out_traverse)
    print(f"Captured {out_traverse}")

    # Copy to artifact directory
    target_modal = os.path.join(artifact_dir, "proof_quest_objective_center_dialog_at_start.png")
    target_board = os.path.join(artifact_dir, "proof_starting_room_revealed_and_toolbar.png")
    target_traverse = os.path.join(artifact_dir, "proof_hero_traversing_first_room.png")

    shutil.copyfile(out_modal, target_modal)
    shutil.copyfile(out_board, target_board)
    shutil.copyfile(out_traverse, target_traverse)
    print(f"Copied all proofs to {artifact_dir}")

finally:
    try:
        proc.terminate()
        proc.wait(timeout=2.0)
    except Exception:
        proc.kill()
