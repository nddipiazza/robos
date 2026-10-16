#!/usr/bin/env python3
"""
Capture high-res visual proofs of the Quest Complete Modal (Victory & Defeat) and Victory Banner.
"""

import os
import shutil
import signal
import subprocess
import sys
import time

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer

PORT = 18198
play_script = os.path.join(ROOT_DIR, "play.sh")
env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT))

proc = subprocess.Popen(
    ["xvfb-run", "--auto-servernum", play_script, "--role=player", "--reset"],
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

    time.sleep(1.0)

    # First dismiss quest objective modal if open
    if ai.is_quest_objective_open():
        ai.close_quest_objective()
        time.sleep(0.5)

    # Resolve elf spell modal if visible
    st = ai.get_state()
    if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
        ai.select_elf_element("water", confirm=True)
        time.sleep(0.5)
    ai.close_elf_spell_modal()
    time.sleep(0.5)

    # 1. Trigger Quest Victory (complete_quest without auto-quit)
    ai.complete_quest(quit=False)
    time.sleep(1.0)

    # 1. Capture Victory Modal proof
    out_vic = "/tmp/tabletop_quest_completion_victory_modal.png"
    ai.take_screenshot(out_vic)
    print(f"Captured {out_vic}")
    shutil.copyfile(out_vic, os.path.join(artifact_dir, "tabletop_quest_completion_victory_modal.png"))
    shutil.copyfile(out_vic, os.path.join(TESTS_DIR, "recordings", "quest_completion_victory_modal.png"))

    # 2. Dismiss modal to view dungeon board and top banner
    ai.close_quest_complete_modal()
    time.sleep(0.8)

    out_banner = "/tmp/tabletop_quest_completion_banner.png"
    ai.take_screenshot(out_banner)
    print(f"Captured {out_banner}")
    shutil.copyfile(out_banner, os.path.join(artifact_dir, "tabletop_quest_completion_banner.png"))
    shutil.copyfile(out_banner, os.path.join(TESTS_DIR, "recordings", "quest_completion_banner.png"))

    # 3. Open Defeat modal proof
    ai.open_quest_complete_modal(is_victory=False)
    time.sleep(0.8)

    out_def = "/tmp/tabletop_quest_defeat_modal.png"
    ai.take_screenshot(out_def)
    print(f"Captured {out_def}")
    shutil.copyfile(out_def, os.path.join(artifact_dir, "tabletop_quest_defeat_modal.png"))
    shutil.copyfile(out_def, os.path.join(TESTS_DIR, "recordings", "quest_defeat_modal.png"))

    print("All visual proofs captured successfully!")

finally:
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    try:
        proc.wait(timeout=2.0)
    except Exception:
        pass
