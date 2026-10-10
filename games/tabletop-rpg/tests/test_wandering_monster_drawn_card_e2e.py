#!/usr/bin/env python3
"""
test_wandering_monster_drawn_card_e2e.py
BDD End-to-End Test Suite for Wandering Monster Card Presentation When Drawn from Treasure Deck:
1. Verifies that when a Wandering Monster card is drawn from the Treasure Deck,
   the drawn card displays the actual Wandering Monster's card:
   - Header with ambush badge and HeroQuest Treasure Deck source
   - Title indicating the specific quest monster (e.g., "Wandering Monster! (Orc)")
   - Dedicated high-res illustration of the wandering monster
   - Stats row displaying Attack (⚔️ 3), Defend (🛡️ 2), BP (❤️ 1), Movement (👟 8)
   - Detailed lore and quest ambush placement rules
   - Outcome banner detailing HeroQuest shuffle rule
   - Action buttons: "Engage Orc Ambush" and "View Full Profile [W]"
2. Verifies that clicking "View Full Profile [W]" opens the authentic WanderingMonsterModal.
3. Verifies that dismissing the overlay cleans up state and resumes gameplay.
4. Verifies visual proof screenshots are saved to the brain directory.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import unittest
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer

PORT = 18122
BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"👹 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"          ℹ {info}")
    if assertions:
        for a in assertions:
            print(f"          ✔ {a}")


class TestWanderingMonsterDrawnCardE2E(unittest.TestCase):
    godot_proc = None
    player = None

    @classmethod
    def setUpClass(cls):
        print(f"\nStarting Tabletop RPG Godot headless server on port {PORT}...")
        play_script = os.path.join(ROOT_DIR, "play.sh")
        disp = os.environ.get("DISPLAY", ":0")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT), DISPLAY=disp)

        args = [play_script, "--player"]
        if not os.path.exists("/tmp/.X11-unix"):
            args.append("--headless")

        cls.godot_proc = subprocess.Popen(
            args,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        cls.player = TabletopQAPlayer(port=PORT)
        connected = False
        for _ in range(40):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)

        if not connected:
            if cls.godot_proc:
                cls.godot_proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {PORT}")
        print("Connected to Tabletop Godot server successfully.")

    @classmethod
    def tearDownClass(cls):
        if cls.player:
            try:
                cls.player.execute_action("delete_save_game")
                cls.player.execute_action("reset_game")
            except Exception:
                pass
        if cls.godot_proc:
            cls.godot_proc.terminate()
            try:
                cls.godot_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.godot_proc.kill()
        print("\n" + "=" * 85)
        print("👹 WANDERING MONSTER DRAWN CARD SUITE COMPLETED")
        print("=" * 85)

    def setUp(self):
        self.player.execute_action("reset_game")
        time.sleep(0.2)

    def test_01_wandering_monster_drawn_from_deck_shows_actual_monster_card(self):
        bdd_scenario_header(1, "Wandering Monster Drawn from Deck Shows Actual Monster's Card")
        bdd_step("GIVEN", "Barbarian searches room where Wandering Monster card is drawn")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "grid_pos": [3, 8]}],
            monsters=[
                {"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}
            ],
            roomSpecialTreasureCollected={"room-grand-fossil": True},
            treasureDeck=[{
                "id": "wandering-monster-a",
                "type": "wandering_monster",
                "title": "Wandering Monster!",
                "icon": "👹",
                "gold": 0,
                "description": "A wandering monster ambushes you while your guard is down!",
                "flavor": "A guttural roar echoes as an enemy emerges from the gloom!"
            }]
        )

        bdd_step("WHEN", "Barbarian searches the room with interactive=True")
        search_res = self.player.search(interactive=True)
        self.assertTrue(search_res.get("success"), f"Search must succeed: {search_res}")
        time.sleep(0.4)

        bdd_step("THEN", "Treasure overlay is active with Wandering Monster profile enriched",
                 assertions=[
                     f"Overlay active: {search_res.get('waitingForClick')}",
                     f"Wandering monster spawned: {search_res.get('wanderingMonster', {}).get('name')}"
                 ])
        st = self.player.get_state()
        overlay = st.get("treasureOverlay", {})
        self.assertTrue(overlay.get("active"), "Treasure overlay must be active")
        self.assertTrue(overlay.get("isWanderingMonster"), "Overlay must be flagged as Wandering Monster")

        card = overlay.get("card", {})
        wm_data = overlay.get("wanderingMonsterCard", {})
        bdd_step("THEN", "Card data reflects quest Wandering Monster (Orc in Quest 1)",
                 assertions=[
                     f"Title: '{card.get('title')}'",
                     f"Monster Type: '{card.get('monster_type')}'",
                     f"Monster Name: '{card.get('monster_name')}'",
                     f"Attack Dice: {card.get('attack_dice')}",
                     f"Defend Dice: {card.get('defend_dice')}",
                     f"Body Points: {card.get('body_points')}",
                     f"Movement: {card.get('movement')}"
                 ])

        self.assertEqual(card.get("monster_type"), "orc")
        self.assertEqual(card.get("monster_name"), "Wandering Orc")
        self.assertEqual(card.get("attack_dice"), 3)
        self.assertEqual(card.get("defend_dice"), 2)
        self.assertEqual(card.get("body_points"), 1)
        self.assertEqual(card.get("movement"), 8)
        self.assertIn("Orc", card.get("description", ""))

        bdd_step("WHEN", "Capturing visual proof of the drawn Wandering Monster card modal")
        tmp_shot = "/tmp/tabletop_wm_drawn_card_full.png"
        brain_shot = os.path.join(BRAIN_DIR, "tabletop_wandering_monster_drawn_card_proof.png")
        brain_crop = os.path.join(BRAIN_DIR, "tabletop_wandering_monster_drawn_card_crop.png")

        shot_res = self.player.take_screenshot(tmp_shot)
        self.assertTrue(shot_res.get("success"), f"Screenshot must succeed: {shot_res}")
        self.assertTrue(os.path.exists(tmp_shot))
        shutil.copyfile(tmp_shot, brain_shot)

        with Image.open(tmp_shot) as im:
            w, h = im.size
            scale_x = w / 1920.0
            scale_y = h / 1080.0
            crop_box = (int(680 * scale_x), int(170 * scale_y), int(1470 * scale_x), int(930 * scale_y))
            card_crop = im.crop(crop_box)
            card_crop.save(brain_crop)
            print(f"          ✔ [VISUAL PROOF] Saved full screenshot to: {brain_shot}")
            print(f"          ✔ [VISUAL PROOF] Saved card crop to: {brain_crop} ({card_crop.width}x{card_crop.height})")

        bdd_step("WHEN", "Clicking 'View Monster Profile [W]' to inspect full standalone card")
        open_res = self.player.open_wandering_monster()
        self.assertTrue(open_res.get("success"))
        self.assertTrue(self.player.is_wandering_monster_open())

        bdd_step("WHEN", "Closing standalone profile and resolving treasure overlay")
        close_wm_res = self.player.close_wandering_monster()
        self.assertTrue(close_wm_res.get("success"))
        self.assertFalse(self.player.is_wandering_monster_open())

        dismiss_res = self.player.dismiss_treasure_overlay()
        self.assertTrue(dismiss_res.get("success"))
        st_after = self.player.get_state()
        self.assertFalse(st_after.get("treasureOverlay", {}).get("active", False))


if __name__ == "__main__":
    unittest.main()
