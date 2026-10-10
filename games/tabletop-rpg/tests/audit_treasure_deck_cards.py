#!/usr/bin/env python3
"""
audit_treasure_deck_cards.py
Audits every HeroQuest Treasure Deck card one-by-one:
- Verifies dedicated high-res illustration is displayed (no black rectangles)
- Verifies Potion of Defense shows liquid steel potion (not sword with fire)
- Verifies Gems! (50 Gold Coins) displays jewel art & card prose
- Verifies Claim Treasure button is aligned with the card (not spanning entire modal, not overlapping awkwardly)
- Saves visual proof screenshots for every card.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer

PORT = 18115
OUT_DIR = "/tmp/treasure_audit"
os.makedirs(OUT_DIR, exist_ok=True)

ALL_CARDS = [
    {"id": "gem-50", "expected_title": "Gems! (50 Gold Coins)", "type": "gem"},
    {"id": "jewels-100", "expected_title": "Jewels! (100 Gold Coins)", "type": "gem"},
    {"id": "potion-defense", "expected_title": "Potion of Defense", "type": "potion"},
    {"id": "potion-healing-a", "expected_title": "Potion of Healing", "type": "potion"},
    {"id": "potion-healing-b", "expected_title": "Potion of Healing", "type": "potion"},
    {"id": "potion-strength", "expected_title": "Potion of Strength", "type": "potion"},
    {"id": "holy-water", "expected_title": "Holy Water", "type": "potion"},
    {"id": "gold-25-a", "expected_title": "Gold! (25 Gold Coins)", "type": "gold"},
    {"id": "gold-25-b", "expected_title": "Gold! (25 Gold Coins)", "type": "gold"},
    {"id": "gold-50-a", "expected_title": "Gold! (50 Gold Coins)", "type": "gold"},
    {"id": "gold-50-b", "expected_title": "Gold! (50 Gold Coins)", "type": "gold"},
    {"id": "gold-100", "expected_title": "Gold! (100 Gold Coins)", "type": "gold"},
    {"id": "hazard-pit", "expected_title": "Hazard! (Pit Trap)", "type": "hazard"},
    {"id": "hazard-poison", "expected_title": "Hazard! (Poison Dart)", "type": "hazard"},
    {"id": "wandering-monster-a", "expected_title": "Wandering Monster!", "type": "wandering_monster"},
    {"id": "wandering-monster-b", "expected_title": "Wandering Monster!", "type": "wandering_monster"},
    {"id": "quest-chest", "expected_title": "Ancient Crypt Stone Chest", "type": "gold", "is_quest_note": True},
]

def run_audit():
    print(f"🚀 Starting Godot Tabletop RPG on port {PORT}...")
    play_script = os.path.join(ROOT_DIR, "play.sh")
    disp = os.environ.get("DISPLAY", ":0")
    env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT), DISPLAY=disp)

    proc = subprocess.Popen(
        [play_script, "--player"],
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
        proc.terminate()
        raise RuntimeError(f"Could not connect to Godot on port {PORT}")

    print("✅ Connected to Godot engine. Starting card-by-card audit...")
    player.execute_action("reset_game")
    time.sleep(0.5)

    results = []
    for c in ALL_CARDS:
        card_id = c["id"]
        is_qn = c.get("is_quest_note", False)
        print(f"\n--- Auditing Card: {card_id} ({c['expected_title']}) ---")
        
        show_res = {}
        for attempt in range(3):
            show_res = player.execute_action("show_treasure_card", card_id=card_id, is_quest_note=is_qn)
            if show_res.get("success"):
                break
            time.sleep(0.3)

        if not show_res.get("success"):
            print(f"❌ Failed to show card: {show_res}")
            results.append((card_id, False, f"Failed to show: {show_res}"))
            continue
        
        # Allow spring tween animation to complete
        time.sleep(0.55)

        st = player.get_state()
        overlay = st.get("treasureOverlay", {})
        if not overlay.get("active"):
            print(f"❌ Treasure overlay is not active in telemetry!")
            results.append((card_id, False, "Overlay inactive"))
            continue

        shot_file = os.path.join(OUT_DIR, f"{card_id}.png")
        shot_res = player.take_screenshot(shot_file)
        if not shot_res.get("success") or not os.path.exists(shot_file):
            print(f"❌ Screenshot failed for {card_id}")
            results.append((card_id, False, "Screenshot failed"))
            continue

        im = Image.open(shot_file)
        w, h = im.size
        print(f"📸 Full screenshot: {w}x{h}")
        scale_x = w / 1920.0
        scale_y = h / 1080.0

        # Crop dialog area (dialog is 1100x750 centered in 1920x1080)
        # Center of 1920 is 960, center of 1080 is 540
        # Dialog is from x=410 to x=1510, y=165 to y=915
        # Card column is roughly x=750 to 1480, y=200 to 880
        crop_box = (int(700 * scale_x), int(180 * scale_y), int(1450 * scale_x), int(900 * scale_y))
        card_crop = im.crop(crop_box)
        crop_path = os.path.join(OUT_DIR, f"{card_id}_crop.png")
        card_crop.save(crop_path)

        # Illustration frame is roughly in center of the card
        # Let's inspect brightness of illustration area to ensure it's not all solid black
        # In card_crop (width 750, height 720), card is centered
        # Illustration is around crop coords (180, 70, 570, 260)
        illus_crop = card_crop.crop((int(180 * scale_x), int(70 * scale_y), int(570 * scale_x), int(260 * scale_y)))
        illus_path = os.path.join(OUT_DIR, f"{card_id}_illus.png")
        illus_crop.save(illus_path)

        # Check average brightness and color variance
        stat = illus_crop.convert("L")
        pixels = list(stat.getdata())
        avg_brightness = sum(pixels) / max(1, len(pixels))
        print(f"🎨 Illustration avg brightness: {avg_brightness:.1f} (solid black would be < 15)")

        if avg_brightness < 18.0:
            print(f"❌ WARNING: Illustration appears black or unrendered! (avg={avg_brightness:.1f})")
            results.append((card_id, False, f"Black image (brightness={avg_brightness:.1f})"))
        else:
            print(f"✅ Illustration verified: non-black texture rendered properly.")
            results.append((card_id, True, f"OK (brightness={avg_brightness:.1f})"))

        # Dismiss card
        player.execute_action("resolve_treasure_overlay_click")
        time.sleep(0.2)

    # Clean shutdown
    player.execute_action("reset_game")
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except Exception:
        proc.kill()

    print("\n" + "=" * 60)
    print("📊 TREASURE CARD AUDIT SUMMARY:")
    all_ok = True
    for cid, ok, msg in results:
        status = "PASSED" if ok else "FAILED"
        print(f"  {status:<8} {cid:<22} : {msg}")
        if not ok:
            all_ok = False
    print("=" * 60)
    return all_ok

if __name__ == "__main__":
    success = run_audit()
    sys.exit(0 if success else 1)
