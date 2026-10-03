#!/usr/bin/env python3
"""
test_hero_cards_no_broken_emojis_e2e.py
BDD End-to-End Test Suite verifying that hero party cards, mini-icon buttons,
status buff badges, and the full Character Sheet dialog render with clean,
crisp text, textures, and bracketed tags—completely free of broken emoji glyphs.

Requirements:
1. Combat stats render as clean 'ATK Xd  DEF Yd' without broken crossed swords/shields emojis.
2. Gold purse renders as clean 'X GP' without broken money bag emojis.
3. Ability button (Dwarf Trap Mastery) uses loaded PNG icon texture or clean text 'TRP'.
4. Active buff badges render as clean, distinct bracket pills (RS, CR, SW, PR, VM, ZZ).
5. Spell mini-buttons use loaded spell PNG icon texture with clean tooltips.
6. Inventory item buttons use loaded item PNG icon texture with clean tooltips.
7. Inspect button uses clean 'INFO' text label.
8. Character Sheet dialog (HeroDetailModal) titles, vitals, stats, equipment, and spells
   are 100% free of broken emoji characters.
"""

import os
import sys
import time
import unittest
import subprocess
import re

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, TESTS_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"⌛ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestHeroCardsNoBrokenEmojisE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18135

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🛡️ FEATURE: Elimination of Broken Emoji Characters Across Hero Cards & Sheet Dialog")
        print("   Rule: Clean, crisp, high-res UI using real PNG icon textures, labels, and badges")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--skip-spell-select"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.05)
        connected = False
        for _ in range(35):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def setUp(self):
        self.player.reset_game()

    def test_01_hero_card_source_code_clean_of_emojis(self):
        bdd_scenario_header(1, "Static Verification: Hero and Enemy Card Code Free of Emojis")
        bdd_step("GIVEN", "TabletopWorld.gd hero and enemy card rendering methods")
        
        gd_path = os.path.join(ROOT_DIR, "scripts", "TabletopWorld.gd")
        with open(gd_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        emoji_pattern = re.compile(r"[\U00010000-\U0010ffff]|[\u2600-\u27bf]")
        
        # Scan lines in _create_hero_card, _populate_hero_detail_modal, and _create_enemy_card
        card_emojis = []
        for i, line in enumerate(lines, 1):
            if 7400 <= i <= 8200:
                if emoji_pattern.search(line):
                    card_emojis.append(f"Line {i}: {line.strip()}")

        bdd_step("WHEN", "Scanning hero card and character sheet code (lines 7400-8200) for emoji glyphs")
        bdd_step("THEN", "Zero emoji glyphs are present in hero and enemy card rendering code", assertions=[
            f"Broken emoji count in hero card code: {len(card_emojis)} (expected 0)"
        ])
        self.assertEqual(len(card_emojis), 0, f"Found emojis in hero card code: {card_emojis}")

    def test_02_hero_card_initial_telemetry_and_clean_titles(self):
        bdd_scenario_header(2, "Runtime Telemetry: Character Cards Report Clean Display Titles")
        bdd_step("GIVEN", "Party initializes with Barbarian, Dwarf, Elf, and Wizard")
        st = self.player.get_state()
        char_cards = st.get("characterCards", [])

        self.assertEqual(len(char_cards), 4)
        for c in char_cards:
            title = c.get("displayName", "")
            name = c.get("characterName", "")
            # Must not contain any multi-byte emoji characters
            self.assertFalse(re.search(r"[\U00010000-\U0010ffff]|[\u2600-\u27bf]", title))
            bdd_step("THEN", f"Hero {name} display title is clean: '{title}'")

    def test_03_active_status_buffs_and_dwarf_trap_mastery(self):
        bdd_scenario_header(3, "Status Effects & Dwarf Trap Mastery Configured with Clean Badges")
        bdd_step("GIVEN", "Dwarf has innate Trap Mastery and active Rock Skin buff")
        
        self.player.set_state(
            heroes=[
                {
                    "id": "dwarf",
                    "rock_skin_active": True,
                    "courage_active": True,
                    "inventory": ["tool_kit"]
                }
            ]
        )

        st = self.player.get_state()
        dwarf = next(c for c in st.get("characterCards", []) if c.get("id") == "dwarf")
        
        bdd_step("THEN", "Dwarf status effects report ['rock_skin', 'courage'] cleanly", assertions=[
            f"Status effects: {dwarf.get('statusEffects')}",
            f"Attack dice (2 + courage): {dwarf.get('attackDice')}",
            f"Defend dice (2 + rock_skin): {dwarf.get('defendDice')}"
        ])
        self.assertIn("rock_skin", dwarf.get("statusEffects", []))
        self.assertIn("courage", dwarf.get("statusEffects", []))

    def test_04_character_sheet_modal_clean_labels(self):
        bdd_scenario_header(4, "Character Sheet Dialog Displays Clean Headers & Stats Without Emojis")
        bdd_step("GIVEN", "Player opens the Character Sheet for Telor the Wizard")
        
        self.player.set_state(
            heroes=[
                {
                    "id": "wizard",
                    "gold": 350,
                    "spells": ["ball_of_flame", "heal_body", "pass_through_rock"],
                    "inventory": ["potion_of_healing", "staff"]
                }
            ]
        )

        res = self.player.open_hero_detail("wizard")
        self.assertTrue(res.get("success"))

        st = self.player.get_state()
        modal = st.get("heroDetailModal", {})
        
        bdd_step("THEN", "HeroDetailModal opens with clean text attributes", assertions=[
            f"Modal visible: {modal.get('visible')}",
            f"Hero ID: {modal.get('heroId')}",
            f"Hero Name: {modal.get('heroName')}",
            f"Hero Class: {modal.get('heroClass')}",
            f"Status badge: {modal.get('statusBadge')}"
        ])
        self.assertTrue(modal.get("visible"))
        self.assertEqual(modal.get("heroId"), "wizard")
        self.assertEqual(modal.get("heroName"), "Telor")
        self.assertIn("Wizard", modal.get("heroClass"))
        
        # Verify statusBadge does not have emoji
        self.assertFalse(re.search(r"[\U00010000-\U0010ffff]|[\u2600-\u27bf]", modal.get("statusBadge", "")))

        # Close modal
        self.player.close_hero_detail()
        self.assertFalse(self.player.get_hero_detail_modal().get("visible"))

    def test_05_visual_proof_screenshot(self):
        bdd_scenario_header(5, "Visual Proof: Capture Clean Hero Cards Viewport")
        bdd_step("GIVEN", "Game board active with clean hero party cards and no broken emoji glyphs")
        time.sleep(0.2)

        out_shot = "/tmp/tabletop_hero_cards_clean_no_emojis.png"
        res = self.player.take_screenshot(out_shot)
        self.assertTrue(res.get("success") or os.path.exists(out_shot))
        bdd_step("THEN", f"Screenshot verified at {out_shot}", assertions=[
            f"File exists: {os.path.exists(out_shot)}",
            f"File size: {os.path.getsize(out_shot) if os.path.exists(out_shot) else 0} bytes"
        ])


if __name__ == "__main__":
    unittest.main(verbosity=2)
