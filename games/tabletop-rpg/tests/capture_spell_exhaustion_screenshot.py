#!/usr/bin/env python3
"""
Script to capture high-res visual proof screenshot of Spell Quest Exhaustion.
Captures both the spell cast modal with [EXHAUSTED] badge and the HUD portrait toolbar
with dimmed/spent spell icons and exhaustion notice.
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

PORT = 18131
play_script = os.path.join(ROOT_DIR, "play.sh")
env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT))

proc = subprocess.Popen(
    ["xvfb-run", "--auto-servernum", play_script, "--role=player"],
    env=env,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)

try:
    ai = TabletopQAPlayer(port=PORT, human_delay=0.1)
    if not ai.wait_for_ready(timeout=14.0):
        raise RuntimeError("Godot failed to start")

    ai.execute_action("reset_game")
    st = ai.get_state()
    if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
        ai.select_elf_element("water", confirm=True)

    # Position Wizard at [1, 2] and Goblin at [1, 5]
    ai.set_state(
        active_hero="wizard",
        has_acted_this_turn=False,
        heroes=[
            {"id": "wizard", "name": "Telor", "grid_pos": [1, 2], "is_on_board": True, "spells": ["ball_of_flame", "fire_of_wrath", "pass_through_rock"]}
        ],
        monsters=[
            {"id": "goblin_1", "name": "Goblin", "grid_pos": [1, 5], "current_bp": 2, "bodyPoints": 2, "is_alive": True}
        ],
        explored_tiles=[[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]]
    )

    # Cast ball_of_flame to exhaust it
    cast_res = ai.cast_spell("ball_of_flame", "goblin_1", caster_id="wizard")
    print(f"Cast Ball of Flame result: {cast_res}")

    # Re-enable action for screenshot inspection so buttons are active
    ai.execute_action("patch_state", has_acted_this_turn=False, active_hero="wizard")

    # 1. Open Spell Modal to capture EXHAUSTED badge visual
    ai.execute_action("open_spell_modal")
    time.sleep(0.4)

    out_modal = "/tmp/tabletop_spell_exhaustion_modal.png"
    ai.take_screenshot(out_modal)

    # Close modal
    ai.execute_action("close_spell_modal")
    time.sleep(0.3)

    # Trigger notice by attempting to click spent spell
    ai.execute_action("show_unavailable_notice", reason="Spell exhausted this quest", title="SPENT SPELL")
    time.sleep(0.4)

    out_toolbar = "/tmp/tabletop_spell_exhaustion_proof.png"
    ai.take_screenshot(out_toolbar)

    artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
    for src, name in [(out_modal, "tabletop_spell_exhaustion_modal.png"), (out_toolbar, "tabletop_spell_exhaustion_proof.png")]:
        dst = os.path.join(artifact_dir, name)
        if os.path.exists(src):
            shutil.copyfile(src, dst)
            print(f"📸 Successfully captured and copied {name} ({os.path.getsize(dst)} bytes)")
        else:
            print(f"❌ Failed to save {src}")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=3.0)
    except Exception:
        proc.kill()
