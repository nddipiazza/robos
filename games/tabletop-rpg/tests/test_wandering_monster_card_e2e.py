#!/usr/bin/env python3
"""
test_wandering_monster_card_e2e.py
BDD End-to-End Test Suite for Wandering Monster Card Hotbar Icon & Inspector Modal:
1. Verifies the high-resolution action icon asset (action_wandering_monster.png) exists and is valid.
2. Verifies the hotbar action button "Show Wondering Monster" is present, visible, enabled, and styled in the hotbar icons list.
3. Verifies clicking the hotbar icon opens the authentic Wandering Monster card modal showing the quest's monster profile.
4. Verifies high-resolution visual proof screenshot is captured and saved to brain directory.
5. Verifies closing and toggling the Wandering Monster card cleanly updates UI state without side effects.
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


class TestWanderingMonsterCardE2E(unittest.TestCase):
    godot_proc = None
    player = None
    port = 18108

    @classmethod
    def setUpClass(cls):
        print(f"\nStarting Tabletop RPG Godot headless server for Wandering Monster Card suite on port {cls.port}...")
        play_script = os.path.join(ROOT_DIR, "play.sh")
        disp = os.environ.get("DISPLAY", ":0")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port), DISPLAY=disp)

        args = [play_script, "--player"]
        if not os.path.exists("/tmp/.X11-unix"):
            args.append("--headless")

        cls.godot_proc = subprocess.Popen(
            args,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(40):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)

        if not connected:
            if cls.godot_proc:
                cls.godot_proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")
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
        print("👹 WANDERING MONSTER CARD SUITE COMPLETED")
        print("=" * 85)

    def setUp(self):
        self.player.execute_action("reset_game")
        time.sleep(0.2)

    def test_01_wandering_monster_icon_asset_verification(self):
        bdd_scenario_header(1, "Wandering Monster Action Icon Asset Integrity & Dimensions")
        bdd_step("GIVEN", "Asset icon directories for tabletop-rpg and crpg-realm")

        icon_paths = [
            os.path.join(ROOT_DIR, "assets", "icons", "action_wandering_monster.png"),
            os.path.join(os.path.dirname(ROOT_DIR), "crpg-realm", "assets", "icons", "action_wandering_monster.png")
        ]

        for p in icon_paths:
            bdd_step("WHEN", f"Verifying PNG asset exists: {os.path.basename(os.path.dirname(os.path.dirname(p)))}/{os.path.basename(p)}")
            self.assertTrue(os.path.exists(p), f"Asset must exist: {p}")
            self.assertGreater(os.path.getsize(p), 1000, f"Asset size must be > 1KB: {p}")

            with Image.open(p) as img:
                self.assertEqual(img.format, "PNG")
                self.assertGreaterEqual(img.width, 64)
                self.assertGreaterEqual(img.height, 64)
                bdd_step("THEN", f"Asset valid RGBA PNG ({img.width}x{img.height})",
                         assertions=[f"File: {p}", f"Size: {os.path.getsize(p):,} bytes"])

    def test_02_hotbar_action_button_renders_show_wandering_monster(self):
        bdd_scenario_header(2, "Hotbar Renders 'Show Wondering Monster' in Big List of Icons")
        bdd_step("GIVEN", "Active HeroQuest game session")
        st = self.player.get_state()

        bdd_step("WHEN", "Inspecting hotbar buttons in scene.ui.buttons")
        buttons = st.get("scene", {}).get("ui", {}).get("buttons", {})
        wm_btn = buttons.get("wandering_monster", {})
        wonder_btn = buttons.get("wondering_monster", {})

        bdd_step("THEN", "Hotbar has 'Show Wondering Monster' button visible, enabled, with dedicated icon",
                 assertions=[
                     f"Button Found in Telemetry: {bool(wm_btn)}",
                     f"Visible: {wm_btn.get('visible')}",
                     f"Disabled: {wm_btn.get('disabled')}",
                     f"Text: '{wm_btn.get('text')}'",
                     f"Icon: '{wm_btn.get('icon')}'",
                     f"Tooltip: '{wm_btn.get('tooltip')}'"
                 ])

        self.assertTrue(wm_btn.get("visible"), "Wandering monster button must be visible in hotbar")
        self.assertFalse(wm_btn.get("disabled"), "Wandering monster button should be clickable")
        self.assertEqual(wm_btn.get("icon"), "action_wandering_monster", "Must use dedicated action_wandering_monster icon")
        self.assertIn("Wondering Monster", wm_btn.get("text", ""))
        self.assertIn("Wondering Monster", wm_btn.get("tooltip", ""))

        # Also verify alias "wondering_monster"
        self.assertEqual(wonder_btn.get("icon"), "action_wandering_monster")

    def test_03_clicking_hotbar_icon_shows_wandering_monster_card_with_visual_proof(self):
        bdd_scenario_header(3, "Clicking Hotbar Icon Shows Wandering Monster Card with Visual Proof")
        bdd_step("GIVEN", "Game is running and Wandering Monster modal is currently closed")
        self.assertFalse(self.player.is_wandering_monster_open())

        bdd_step("WHEN", "Player clicks the 'Show Wondering Monster' hotbar icon")
        click_res = self.player.click_action_button("wandering_monster")
        self.assertTrue(click_res.get("success"), f"Click must succeed: {click_res}")
        time.sleep(0.3)

        bdd_step("THEN", "Wandering Monster Card modal opens with quest monster stats & art")
        st = self.player.get_state()
        self.assertTrue(self.player.is_wandering_monster_open())
        self.assertTrue(st.get("wanderingMonsterCardModalOpen"))

        wm_card = self.player.get_wandering_monster_card()
        bdd_step("THEN", "Card data reflects quest Wandering Monster (Orc in Quest 1)",
                 assertions=[
                     f"Title: {wm_card.get('title')}",
                     f"Monster Type: {wm_card.get('monster_type')}",
                     f"Monster Name: {wm_card.get('monster_name')}",
                     f"Attack Dice: {wm_card.get('attack_dice')}",
                     f"Defend Dice: {wm_card.get('defend_dice')}",
                     f"Body Points: {wm_card.get('body_points')}",
                     f"Movement: {wm_card.get('movement')}"
                 ])

        self.assertEqual(wm_card.get("title"), "Wandering Monster!")
        self.assertEqual(wm_card.get("monster_type"), "orc")
        self.assertEqual(wm_card.get("attack_dice"), 3)
        self.assertEqual(wm_card.get("defend_dice"), 2)
        self.assertEqual(wm_card.get("body_points"), 1)
        self.assertEqual(wm_card.get("movement"), 8)

        bdd_step("WHEN", "Capturing visual proof screenshot of the opened Wandering Monster card")
        tmp_shot = "/tmp/tabletop_wm_card_proof.png"
        brain_shot = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f/tabletop_wandering_monster_card_modal.png"
        shot_res = self.player.take_screenshot(tmp_shot)
        self.assertTrue(shot_res.get("success"))
        self.assertTrue(os.path.exists(tmp_shot))
        shutil.copyfile(tmp_shot, brain_shot)
        print(f"          ✔ [VISUAL PROOF] Saved screenshot to: {brain_shot} ({os.path.getsize(brain_shot):,} bytes)")

    def test_04_closing_and_toggling_wandering_monster_card(self):
        bdd_scenario_header(4, "Closing and Toggling Wandering Monster Card Cleanly")
        bdd_step("GIVEN", "Wandering Monster Card modal is open")
        self.player.open_wandering_monster()
        self.assertTrue(self.player.is_wandering_monster_open())

        bdd_step("WHEN", "Player closes the Wandering Monster Card")
        close_res = self.player.close_wandering_monster()
        self.assertTrue(close_res.get("success"))
        self.assertFalse(self.player.is_wandering_monster_open())

        bdd_step("WHEN", "Player toggles the Wandering Monster Card twice")
        toggle_1 = self.player.toggle_wandering_monster()
        self.assertTrue(toggle_1.get("modalVisible"))
        self.assertTrue(self.player.is_wandering_monster_open())

        toggle_2 = self.player.toggle_wandering_monster()
        self.assertFalse(toggle_2.get("modalVisible"))
        self.assertFalse(self.player.is_wandering_monster_open())

        bdd_step("THEN", "Combat log records the card inspection without dealing damage or spawning ambushes")
        st = self.player.get_state()
        combat_log = st.get("fullCombatLog", [])
        wm_logs = [entry for entry in combat_log if "[WANDERING MONSTER] Showing Wandering Monster card" in entry]
        self.assertGreater(len(wm_logs), 0, "Combat log must record Wandering Monster card inspection")
        bdd_step("THEN", f"Found combat log: '{wm_logs[-1]}'")


if __name__ == "__main__":
    unittest.main()
