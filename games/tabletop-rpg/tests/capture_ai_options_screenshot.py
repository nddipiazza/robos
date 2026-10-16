#!/usr/bin/env python3
"""
Capture high-res visual proofs of the AI Engine Options modal and header AI icon.
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

PORT = 18197
play_script = os.path.join(ROOT_DIR, "play.sh")
env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT))

proc = subprocess.Popen(
    ["xvfb-run", "--auto-servernum", play_script, "--role=player", "--reset", "--skip-spell-select"],
    env=env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    preexec_fn=os.setsid
)

artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"

try:
    ai = TabletopQAPlayer(port=PORT, human_delay=0.1)
    if not ai.wait_for_ready(timeout=16.0):
        raise RuntimeError("Godot failed to start")

    time.sleep(2.0)

    # Resolve elf spell modal if visible
    ai.select_elf_element("water", confirm=True)
    ai.close_elf_spell_modal()
    ai.execute_action("close_all_dialogs")
    time.sleep(0.5)

    if ai.is_quest_objective_open():
        ai.close_quest_objective()
        time.sleep(0.3)

    # 1. Capture Main Screen with 🤖 AI Options button on bottom-left and clean un-overflowed header
    out_hud = "/tmp/tabletop_ai_bottom_left_button_proof.png"
    ai.take_screenshot(out_hud)
    print(f"Captured {out_hud}")
    shutil.copyfile(out_hud, os.path.join(artifact_dir, "tabletop_ai_bottom_left_button_proof.png"))
    shutil.copyfile(out_hud, os.path.join(artifact_dir, "tabletop_ai_header_proof.png"))
    shutil.copyfile(out_hud, os.path.join(TESTS_DIR, "recordings", "ai_header_proof.png"))

    # 2. Open AI Engine Options dialog (Unchecked state)
    ai.open_ai_options()
    time.sleep(0.6)

    out_modal = "/tmp/tabletop_ai_engine_options_dialog_proof.png"
    ai.take_screenshot(out_modal)
    print(f"Captured {out_modal}")
    shutil.copyfile(out_modal, os.path.join(artifact_dir, "tabletop_ai_engine_options_dialog_proof.png"))
    shutil.copyfile(out_modal, os.path.join(TESTS_DIR, "recordings", "ai_engine_options_dialog_proof.png"))

    # 3. Check both boxes and capture checked state
    ai.set_ai_options(ai_play_for_you=True, auto_advance_turn=True)
    time.sleep(0.6)
    out_checked = "/tmp/tabletop_ai_engine_options_checked_proof.png"
    ai.take_screenshot(out_checked)
    print(f"Captured {out_checked}")
    shutil.copyfile(out_checked, os.path.join(artifact_dir, "tabletop_ai_engine_options_checked_proof.png"))
    shutil.copyfile(out_checked, os.path.join(TESTS_DIR, "recordings", "ai_engine_options_checked_proof.png"))

finally:
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, 9)
    except Exception:
        proc.kill()
