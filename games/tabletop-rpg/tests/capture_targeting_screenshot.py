#!/usr/bin/env python3
"""
Script to capture high-res visual proof screenshot of Baldur's Gate 1 Style Targeting Mode.
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

PORT = 18130
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

    # Position Wizard at [1, 2] and Goblin at [1, 5] with explored corridor
    ai.set_state(
        active_hero="wizard",
        has_acted_this_turn=False,
        heroes=[
            {"id": "wizard", "name": "Telor", "grid_pos": [1, 2], "is_on_board": True, "spells": ["ball_of_flame", "fire_of_wrath"]}
        ],
        monsters=[
            {"id": "goblin_1", "name": "Goblin", "grid_pos": [1, 5], "current_bp": 1, "bodyPoints": 1, "is_alive": True}
        ],
        explored_tiles=[[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]]
    )

    # Start targeting Ball of Flame
    ai.start_targeting("spell", "ball_of_flame", "wizard")

    # Get tile metrics
    st = ai.get_state()
    tile_size = 40.0
    board_offset = [60.0, 50.0]
    scene_metrics = st.get("scene", {}).get("board", {})
    if scene_metrics:
        tile_size = float(scene_metrics.get("tileSize", 40.0))
        bo = scene_metrics.get("boardOffset", [60.0, 50.0])
        board_offset = [float(bo[0]), float(bo[1])]

    # Aim mouse directly at Goblin tile [1, 5]
    mouse_x = board_offset[0] + (1.5 * tile_size)
    mouse_y = board_offset[1] + (5.5 * tile_size)
    ai.execute_action("set_test_mouse_pos", x=mouse_x, y=mouse_y)

    time.sleep(0.5)

    # Capture screenshot
    out_tmp = "/tmp/tabletop_bg1_targeting_mode_proof.png"
    ai.take_screenshot(out_tmp)

    artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
    art_path = os.path.join(artifact_dir, "tabletop_bg1_targeting_mode_proof.png")
    if os.path.exists(out_tmp):
        shutil.copyfile(out_tmp, art_path)
        print(f"📸 Successfully captured and copied screenshot to {art_path} ({os.path.getsize(art_path)} bytes)")
    else:
        print("❌ Screenshot failed to save to /tmp")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=3.0)
    except Exception:
        proc.kill()
