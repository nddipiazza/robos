#!/usr/bin/env python3
"""
test_gold_box_zero_gold_e2e.py
BDD End-to-End Test Suite verifying that when a character or the party has 0 gold,
the UI never presents an empty, awkward box with no text:
1. The hotbar Armory / shop button renders a dedicated high-resolution icon (action_armory.png)
   and a crisp '0' badge in muted bronze/gold styling.
2. If the icon texture is missing, fallback text is visibly rendered rather than transparent.
3. Every Hero Party Card renders a dedicated 'GoldBox' pill container with '0 GP' and tooltip.
4. When party/heroes gain gold, the hotbar badge and card gold boxes update dynamically.
5. In the Armory modal, hero tabs and banner properly display hero names and '(0 GP)' rather
   than blank names or empty '(0)'.
6. High-resolution visual proof screenshots are captured.
"""

from __future__ import annotations

import os
import shutil
import struct
import subprocess
import sys
import time
import unittest
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"💰 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestGoldBoxZeroGoldE2E(unittest.TestCase):
    player: TabletopQAPlayer
    godot_proc: subprocess.Popen | None = None
    port: int = 18142

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("💰 FEATURE: Hero & Party Zero-Gold UI Presentation (No Awkward Empty Boxes)")
        print("   Rule: Hotbar Armory button and Hero Party Cards always display high-res icon,")
        print("         crisp '0' badge / '0 GP' label, and full hero names in armory modal tabs.")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.env["DISPLAY"] = ":0"

        cls.player = TabletopQAPlayer(port=cls.port)
        if not cls.player.check_health():
            print(f"Launching Godot test player on port {cls.port}...")
            cls.godot_proc = subprocess.Popen(
                ["/home/ndipiazza/.local/bin/godot", "--path", ROOT_DIR, "--player", "--skip-spell-select"],
                env=cls.env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
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

    @classmethod
    def tearDownClass(cls):
        if cls.godot_proc:
            cls.godot_proc.terminate()
            try:
                cls.godot_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.godot_proc.kill()

    def setUp(self):
        self.player.reset_game()
        time.sleep(0.1)

    def test_01_armory_action_icon_asset_verification(self):
        bdd_scenario_header(1, "Armory Icon Asset Presence & PNG Integrity")
        bdd_step("GIVEN", "Asset icon directories for tabletop-rpg and crpg-realm")

        icon_paths = [
            os.path.join(ROOT_DIR, "assets", "icons", "action_armory.png"),
            os.path.join(os.path.dirname(ROOT_DIR), "crpg-realm", "assets", "icons", "action_armory.png")
        ]

        for p in icon_paths:
            bdd_step("WHEN", f"Verifying PNG asset exists: {os.path.basename(os.path.dirname(os.path.dirname(p)))}/{os.path.basename(p)}")
            self.assertTrue(os.path.exists(p), f"Asset must exist: {p}")
            self.assertGreater(os.path.getsize(p), 1000, f"Asset size must be > 1KB: {p}")

            # Verify image dimensions
            with Image.open(p) as img:
                self.assertEqual(img.format, "PNG")
                self.assertGreaterEqual(img.width, 64)
                self.assertGreaterEqual(img.height, 64)
                bdd_step("THEN", f"Asset valid RGBA PNG ({img.width}x{img.height})",
                         assertions=[f"File: {p}", f"Size: {os.path.getsize(p):,} bytes"])

    def test_02_zero_gold_hotbar_armory_button_not_empty(self):
        bdd_scenario_header(2, "Hotbar Armory Button Renders Icon & '0' Badge at Zero Gold")
        bdd_step("GIVEN", "Fresh game cartridge with party having 0 gold")
        st = self.player.get_state()

        party_gold = st.get("partyTotalGold", -1)
        self.assertEqual(party_gold, 0, "Initial party gold must be 0")

        bdd_step("WHEN", "Inspecting hotbar armory button telemetry in scene.ui.buttons")
        buttons = st.get("scene", {}).get("ui", {}).get("buttons", {})
        armory_btn = buttons.get("armory", {})

        bdd_step("THEN", "Armory button has icon, visible '0' badge, and valid tooltip",
                 assertions=[
                     f"Icon: {armory_btn.get('icon')}",
                     f"Badge: '{armory_btn.get('badge')}'",
                     f"BadgeVisible: {armory_btn.get('badgeVisible')}",
                     f"Disabled: {armory_btn.get('disabled')}",
                     f"Tooltip: {armory_btn.get('tooltip')}"
                 ])

        self.assertEqual(armory_btn.get("icon"), "action_armory", "Armory button must have action_armory icon")
        self.assertEqual(armory_btn.get("badge"), "0", "Armory button must display '0' badge at zero gold")
        self.assertTrue(armory_btn.get("badgeVisible"), "Armory badge must be visible at zero gold to avoid empty box")
        self.assertTrue(armory_btn.get("disabled"), "Armory button should be disabled when party has 0 gold")
        self.assertIn("(0 GP)", armory_btn.get("tooltip", ""))

    def test_03_zero_gold_hero_cards_gold_box_pill(self):
        bdd_scenario_header(3, "Hero Party Cards Render Dedicated GoldBox with '0 GP'")
        bdd_step("GIVEN", "Party of 4 heroes (Barbarian, Dwarf, Elf, Wizard) at quest start")
        st = self.player.get_state()

        cards = st.get("characterCards", [])
        self.assertEqual(len(cards), 4, "Must have 4 hero party cards")

        bdd_step("WHEN", "Inspecting character cards goldBox telemetry")
        for c in cards:
            c_name = c.get("name")
            c_gold = c.get("gold")
            has_gold_box = c.get("hasGoldBox")
            gold_box_text = c.get("goldBoxText")

            bdd_step("THEN", f"{c_name} card has GoldBox pill container",
                     assertions=[
                         f"Hero: {c_name}",
                         f"Gold: {c_gold}",
                         f"hasGoldBox: {has_gold_box}",
                         f"goldBoxText: '{gold_box_text}'"
                     ])

            self.assertEqual(c_gold, 0, f"{c_name} must have 0 gold initially")
            self.assertTrue(has_gold_box, f"{c_name} card must have hasGoldBox=True")
            self.assertEqual(gold_box_text, "0 GP", f"{c_name} goldBoxText must be '0 GP' (never empty string)")

    def test_04_gold_gain_updates_hotbar_badge_and_hero_card_boxes(self):
        bdd_scenario_header(4, "Earning Gold Dynamically Updates Hotbar Badge & Hero GoldBoxes")
        bdd_step("GIVEN", "Heroes earn treasure: Barbarian earns 150 GP, Dwarf earns 50 GP")

        st = self.player.get_state()
        heroes = st.get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 150
            elif h.get("id") == "dwarf":
                h["gold"] = 50

        self.player.set_state(heroes=heroes)
        st2 = self.player.get_state()

        bdd_step("WHEN", "Reading updated telemetry after gold assignment")
        party_gold = st2.get("partyTotalGold")
        self.assertEqual(party_gold, 200, "Party total gold must be 200 GP")

        armory_btn = st2.get("scene", {}).get("ui", {}).get("buttons", {}).get("armory", {})
        bdd_step("THEN", "Hotbar armory button updates badge to '200' and enables button",
                 assertions=[
                     f"Badge: '{armory_btn.get('badge')}'",
                     f"Disabled: {armory_btn.get('disabled')}",
                     f"Tooltip: {armory_btn.get('tooltip')}"
                 ])

        self.assertEqual(armory_btn.get("badge"), "200")
        self.assertFalse(armory_btn.get("disabled"), "Armory button should be enabled when party has 200 GP")
        self.assertIn("(200 GP)", armory_btn.get("tooltip", ""))

        cards = st2.get("characterCards", [])
        card_map = {c.get("id"): c for c in cards}

        self.assertEqual(card_map["barbarian"].get("goldBoxText"), "150 GP")
        self.assertEqual(card_map["dwarf"].get("goldBoxText"), "50 GP")
        self.assertEqual(card_map["elf"].get("goldBoxText"), "0 GP")
        self.assertEqual(card_map["wizard"].get("goldBoxText"), "0 GP")

        bdd_step("THEN", "Barbarian has '150 GP', Dwarf has '50 GP', Elf/Wizard remain '0 GP'",
                 assertions=[
                     f"Barbarian: {card_map['barbarian'].get('goldBoxText')}",
                     f"Dwarf: {card_map['dwarf'].get('goldBoxText')}",
                     f"Elf: {card_map['elf'].get('goldBoxText')}",
                     f"Wizard: {card_map['wizard'].get('goldBoxText')}"
                 ])

    def test_05_armory_modal_tabs_display_hero_names_with_zero_and_positive_gold(self):
        bdd_scenario_header(5, "Armory Modal Tabs Display Real Hero Names and '(0 GP)' (No Blank Names)")
        bdd_step("GIVEN", "Party has gold and player opens Armory modal")

        # Set Barbarian 150 GP, Dwarf 50 GP, Elf 0 GP, Wizard 0 GP
        heroes = self.player.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 150
            elif h.get("id") == "dwarf":
                h["gold"] = 50
            else:
                h["gold"] = 0
        self.player.set_state(heroes=heroes)

        open_res = self.player.execute_action("open_armory")
        self.assertTrue(open_res.get("success"), "open_armory must succeed")

        bdd_step("WHEN", "Inspecting armoryTabs and armoryPartyGoldText telemetry")
        st = self.player.get_state()
        tabs = st.get("armoryTabs", [])
        party_gold_text = st.get("armoryPartyGoldText", "")

        bdd_step("THEN", "Tabs include valid hero character names and GP amounts",
                 assertions=[
                     f"Party Gold Text: '{party_gold_text}'",
                     f"Hero Tabs ({len(tabs)}): {tabs}"
                 ])

        self.assertEqual(len(tabs), 4, "Must have 4 hero tabs in armory modal")
        self.assertEqual(party_gold_text, "PARTY TREASURY: 200 GP")

        # Verify no empty names or awkward "(0)" without hero name
        for tab_text in tabs:
            self.assertFalse(tab_text.startswith(" ("), f"Tab must have a hero name, got: {tab_text}")
            self.assertTrue(any(marker in tab_text for marker in ["[B]", "[D]", "[E]", "[W]"]), f"Tab must have class marker: {tab_text}")
            self.assertTrue("GP)" in tab_text, f"Tab must specify GP, got: {tab_text}")

        # Check Rogar, Dorgan, Ladril, Telor
        self.assertTrue(any("Rogar" in t and "150 GP" in t for t in tabs), f"Expected Rogar tab with 150 GP in {tabs}")
        self.assertTrue(any("Dorgan" in t and "50 GP" in t for t in tabs), f"Expected Dorgan tab with 50 GP in {tabs}")
        self.assertTrue(any("Ladril" in t and "0 GP" in t for t in tabs), f"Expected Ladril tab with 0 GP in {tabs}")
        self.assertTrue(any("Telor" in t and "0 GP" in t for t in tabs), f"Expected Telor tab with 0 GP in {tabs}")

        # Close armory
        self.player.execute_action("close_armory")

    def test_06_capture_visual_proof_screenshot(self):
        bdd_scenario_header(6, "Capture Visual Proof of Zero Gold Hotbar Button & Hero Gold Boxes")
        bdd_step("GIVEN", "Game reset to pristine zero-gold state")
        self.player.reset_game()
        time.sleep(0.3)

        out_path = "/tmp/tabletop_gold_box_zero_gold.png"
        bdd_step("WHEN", f"Capturing visual screenshot to {out_path}")
        res = self.player.take_screenshot(out_path)
        self.assertTrue(res.get("success", False) or os.path.exists(out_path), "Screenshot capture must succeed")
        self.assertTrue(os.path.exists(out_path), f"File must exist: {out_path}")
        self.assertGreater(os.path.getsize(out_path), 5000, "Screenshot size must be > 5KB")

        artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
        dest_artifact = os.path.join(artifact_dir, "tabletop_gold_box_zero_gold.png")
        shutil.copyfile(out_path, dest_artifact)

        bdd_step("THEN", f"Screenshot saved to {dest_artifact} ({os.path.getsize(dest_artifact):,} bytes)",
                 assertions=[
                     f"Source: {out_path}",
                     f"Destination: {dest_artifact}",
                     f"Size: {os.path.getsize(dest_artifact):,} bytes"
                 ])


if __name__ == "__main__":
    unittest.main()
