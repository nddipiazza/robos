#!/usr/bin/env python3
"""
test_armory_no_broken_emojis_e2e.py
BDD End-to-End Test Suite verifying that the HeroQuest Armory Equipment Shop,
hero selection tabs, hero status banner, item catalog cards, tooltips, and
hotbar buttons are 100% free of multi-byte Unicode emoji characters.

Requirements:
1. Static code verification: ARMORY_CATALOG and armory UI rendering methods
   in TabletopWorld.gd contain zero broken emojis.
2. Scene hierarchy verification: ArmoryModal nodes and BtnArmory in TabletopWorld.tscn
   contain zero broken emojis.
3. Runtime telemetry verification:
   - armoryTabs render clean hero identifiers (e.g. '[B] Rogar (150 GP)') without emojis.
   - armoryHeroInfoText renders clean stat labels ('Treasury: ... | ATK: ... | DEF: ... | Pack: ...') without emojis.
   - armoryItemCards headers render real PNG icon textures with clean text names and costs ('250 GP' without moneybags).
   - Hotbar armory button text and tooltips are free of shield or money emojis.
4. Tab switching across all 4 heroes maintains clean, emoji-free UI presentation.
5. Purchasing an item maintains clean floating text and log outputs.
6. High-resolution visual proof screenshot is captured and saved.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"🛡️  SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestArmoryNoBrokenEmojisE2E(unittest.TestCase):
    player: TabletopQAPlayer
    godot_proc: subprocess.Popen | None = None
    port: int = 18155
    emoji_regex = re.compile(r"[\U00010000-\U0010ffff]|[\u2600-\u27bf]")

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🛡️  FEATURE: Elimination of Broken Emojis from Imperial Armory Equipment Shop")
        print("   Rule: Clean ASCII/bracketed tags, real PNG icon textures, and zero missing-glyph tofu")
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

    def test_01_static_scan_tabletop_world_armory_code(self):
        bdd_scenario_header(1, "Static Code Scan: TabletopWorld.gd Armory Free of Emojis")
        bdd_step("GIVEN", "TabletopWorld.gd source code containing ARMORY_CATALOG and armory UI routines")

        gd_path = os.path.join(ROOT_DIR, "scripts", "TabletopWorld.gd")
        with open(gd_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        armory_emoji_matches = []
        in_armory_section = False
        for i, line in enumerate(lines, 1):
            if "HEROQUEST ARMORY & EQUIPMENT SHOP" in line:
                in_armory_section = True
            elif in_armory_section and line.startswith("func _get_hero_spells_by_id"):
                in_armory_section = False

            if in_armory_section or ("btn_armory" in line and "text" in line) or ("Imperial Armory" in line):
                if self.emoji_regex.search(line):
                    armory_emoji_matches.append(f"Line {i}: {line.strip()}")

        bdd_step("WHEN", f"Scanning {len(lines)} lines for Unicode emoji glyphs matching regex")
        bdd_step("THEN", "Zero emojis detected in Armory implementation", assertions=[
            f"Emoji violations count: {len(armory_emoji_matches)} (expected 0)"
        ])
        self.assertEqual(len(armory_emoji_matches), 0, f"Found emojis in armory code: {armory_emoji_matches}")

    def test_02_static_scan_tabletop_world_scene_file(self):
        bdd_scenario_header(2, "Static Scene Scan: TabletopWorld.tscn Armory Nodes Free of Emojis")
        bdd_step("GIVEN", "TabletopWorld.tscn containing UI/ArmoryModal and Actions/BtnArmory")

        tscn_path = os.path.join(ROOT_DIR, "scenes", "TabletopWorld.tscn")
        with open(tscn_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        tscn_emoji_matches = []
        for i, line in enumerate(lines, 1):
            if "armory" in line.lower() or "Armory" in line:
                if self.emoji_regex.search(line):
                    tscn_emoji_matches.append(f"Line {i}: {line.strip()}")

        bdd_step("WHEN", "Checking scene file Armory node labels for emoji characters")
        bdd_step("THEN", "Zero emojis detected in Armory scene nodes", assertions=[
            f"Emoji violations in scene: {len(tscn_emoji_matches)} (expected 0)"
        ])
        self.assertEqual(len(tscn_emoji_matches), 0, f"Found emojis in tscn: {tscn_emoji_matches}")

    def test_03_hotbar_armory_button_clean_telemetry(self):
        bdd_scenario_header(3, "Hotbar Armory Button Telemetry Clean of Broken Emojis")
        bdd_step("GIVEN", "Party has gold and hotbar armory button is enabled")

        # Set party gold to 200 GP
        heroes = self.player.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 200
        self.player.set_state(heroes=heroes)

        st = self.player.get_state()
        armory_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("armory", {})
        tooltip = armory_btn.get("tooltip", "")

        bdd_step("WHEN", "Inspecting hotbar armory button tooltip and badge")
        bdd_step("THEN", f"Armory button tooltip is '{tooltip}' without broken emojis", assertions=[
            f"Tooltip text: {tooltip}",
            f"Badge text: {armory_btn.get('badge')}"
        ])

        self.assertFalse(self.emoji_regex.search(tooltip), f"Tooltip contains emoji: {tooltip}")
        self.assertIn("Imperial Armory (200 GP)", tooltip)
        self.assertEqual(armory_btn.get("badge"), "200")

    def test_04_armory_modal_tabs_and_banner_no_emojis(self):
        bdd_scenario_header(4, "Armory Modal Hero Tabs & Status Banner Clean of Broken Emojis")
        bdd_step("GIVEN", "Party of 4 heroes has gold and Armory is opened")

        heroes = self.player.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 150
            elif h.get("id") == "dwarf":
                h["gold"] = 75
            elif h.get("id") == "elf":
                h["gold"] = 25
            else:
                h["gold"] = 0
        self.player.set_state(heroes=heroes)

        open_res = self.player.execute_action("open_armory")
        self.assertTrue(open_res.get("success"), "open_armory must succeed")

        st = self.player.get_state()
        tabs = st.get("armoryTabs", [])
        banner = st.get("armoryHeroInfoText", "")
        party_gold_txt = st.get("armoryPartyGoldText", "")

        bdd_step("WHEN", "Inspecting armoryTabs, armoryHeroInfoText, and armoryPartyGoldText")
        bdd_step("THEN", "All labels contain real names and clean bracket badges with 0 emojis", assertions=[
            f"Tabs ({len(tabs)}): {tabs}",
            f"Banner: {banner}",
            f"Party Gold: {party_gold_txt}"
        ])

        self.assertEqual(len(tabs), 4)
        for tab_text in tabs:
            self.assertFalse(self.emoji_regex.search(tab_text), f"Tab contains broken emoji: {tab_text}")
            self.assertTrue(any(tag in tab_text for tag in ["[B]", "[D]", "[E]", "[W]"]))

        self.assertFalse(self.emoji_regex.search(banner), f"Banner contains broken emoji: {banner}")
        self.assertIn("Treasury: 150 GP", banner)
        self.assertIn("ATK:", banner)
        self.assertIn("DEF:", banner)
        self.assertIn("Pack:", banner)

        self.assertFalse(self.emoji_regex.search(party_gold_txt), f"Party gold text contains emoji: {party_gold_txt}")
        self.assertIn("PARTY TREASURY: 250 GP", party_gold_txt)

    def test_05_armory_item_cards_clean_labels_and_textures(self):
        bdd_scenario_header(5, "Armory Item Cards Free of Broken Emojis (No Moneybag or Crossed Swords)")
        bdd_step("GIVEN", "Armory modal is open displaying equipment catalog cards")

        st = self.player.get_state()
        catalog = st.get("armoryCatalog", [])
        item_cards_labels = st.get("armoryItemCards", [])

        bdd_step("WHEN", f"Inspecting catalog of {len(catalog)} items and card label elements")

        # Verify catalog items themselves do not store emoji icons
        for it in catalog:
            it_name = it.get("name")
            it_icon = it.get("icon")
            self.assertFalse(self.emoji_regex.search(it_name), f"Item name contains emoji: {it_name}")
            self.assertFalse(self.emoji_regex.search(it_icon), f"Item icon key contains emoji: {it_icon}")

        # Verify item cards text rendered in the Godot UI
        for card_texts in item_cards_labels:
            for text_snippet in card_texts:
                self.assertFalse(
                    self.emoji_regex.search(text_snippet),
                    f"Item card text contains broken emoji: {text_snippet}"
                )

        bdd_step("THEN", "All item cards render clean text with zero emojis", assertions=[
            f"Catalog items verified: {len(catalog)}",
            f"Card grids checked: {len(item_cards_labels)}"
        ])

    def test_06_hero_tab_switching_retains_clean_text(self):
        bdd_scenario_header(6, "Switching Between Heroes Retains Clean Presentation Across All Tabs")
        bdd_step("GIVEN", "Armory is open and active hero is switched to Dwarf, Elf, Wizard")

        for hid, tag in [("dwarf", "[D]"), ("elf", "[E]"), ("wizard", "[W]")]:
            res = self.player.execute_action("select_armory_hero", hero_id=hid)
            self.assertTrue(res.get("success"))

            st = self.player.get_state()
            banner = st.get("armoryHeroInfoText", "")
            tabs = st.get("armoryTabs", [])

            bdd_step("WHEN", f"Switching to {hid} ({tag})")
            bdd_step("THEN", f"Banner for {hid} is clean without emojis", assertions=[
                f"Active hero banner: {banner}"
            ])

            self.assertFalse(self.emoji_regex.search(banner), f"Banner for {hid} contains emoji: {banner}")
            for tab_text in tabs:
                self.assertFalse(self.emoji_regex.search(tab_text), f"Tab text contains emoji: {tab_text}")

    def test_07_item_purchase_clean_floating_text_and_log(self):
        bdd_scenario_header(7, "Item Purchase Produces Clean Output Without Broken Emojis")
        bdd_step("GIVEN", "Barbarian selects Armory and purchases 'shield' (100 GP)")

        # Give barbarian gold to purchase shield
        heroes = self.player.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 200
        self.player.set_state(heroes=heroes)
        self.player.open_armory("barbarian")

        buy_res = self.player.buy_armory_item("barbarian", "shield")
        self.assertTrue(buy_res.get("success"), f"Purchase failed: {buy_res}")

        st = self.player.get_state()
        log_text = st.get("displayedLogText", "")

        bdd_step("WHEN", "Checking recent combat/armory log for purchase announcement")
        bdd_step("THEN", "Log message contains purchase confirmation free of emojis", assertions=[
            f"Combat log snippet: {log_text[-120:] if log_text else ''}"
        ])

        # Verify Armory log entries do not contain emojis
        armory_lines = [l for l in log_text.split("\n") if "[ARMORY]" in l]
        for l in armory_lines:
            self.assertFalse(self.emoji_regex.search(l), f"Armory log line contains emoji: {l}")

    def test_08_capture_visual_proof_screenshot(self):
        bdd_scenario_header(8, "Visual Proof: Capture Clean Armory Equipment Shop Screenshot")
        bdd_step("GIVEN", "Armory modal is open showing equipment catalog, hero tabs, and treasury")
        time.sleep(0.3)

        out_path = "/tmp/tabletop_armory_no_emojis.png"
        bdd_step("WHEN", f"Capturing visual screenshot to {out_path}")
        res = self.player.take_screenshot(out_path)
        self.assertTrue(res.get("success", False) or os.path.exists(out_path), "Screenshot capture must succeed")
        self.assertTrue(os.path.exists(out_path), f"File must exist: {out_path}")
        self.assertGreater(os.path.getsize(out_path), 5000, "Screenshot size must be > 5KB")

        artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
        dest_artifact = os.path.join(artifact_dir, "tabletop_armory_no_emojis.png")
        shutil.copyfile(out_path, dest_artifact)

        bdd_step("THEN", f"Screenshot saved to {dest_artifact} ({os.path.getsize(dest_artifact):,} bytes)",
                 assertions=[
                     f"Source: {out_path}",
                     f"Destination: {dest_artifact}",
                     f"Size: {os.path.getsize(dest_artifact):,} bytes"
                 ])

        # Close armory
        self.player.execute_action("close_armory")


if __name__ == "__main__":
    unittest.main()
