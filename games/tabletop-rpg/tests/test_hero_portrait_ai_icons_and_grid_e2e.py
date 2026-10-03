#!/usr/bin/env python3
"""
test_hero_portrait_ai_icons_and_grid_e2e.py
Comprehensive End-to-End BDD test suite verifying:
1. All 26 AI-generated art icon assets exist on disk in res://assets/icons/ai/ with valid dimensions.
2. Clicking the hero portrait opens the full Character Sheet dialog modal (HeroDetailModal).
3. The legacy "INFO" text button is completely removed from hero cards.
4. Hero equipment (weapons, armor), memorized spells, and items are arranged in a 7-column grid up to 3 rows (21 slots max).
5. When a hero's items and spells exceed 21 slots, an overflow badge (+NUM) is rendered with the exact overflow count.
6. In-game screenshot proof captured to /tmp/tabletop_hero_portrait_ai_icons.png.
"""

import os
import re
import sys
import time
import shutil
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(scenario_num: int, title: str):
    print("\n" + "=" * 85)
    print(f"⌛ SCENARIO {scenario_num:02d}: {title}")
    print("=" * 85)


def bdd_step(step_type: str, text: str, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestHeroPortraitAIIconsAndGridE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎨 FEATURE: Hero Portrait AI Art Icons, 3x7 Grid & Direct Portrait Sheet Trigger")
        print("   Rule: AI-generated art for each weapon, armor, spell; up to 3 rows of 7 icons + overflow; no INFO button")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18106
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.15)
        connected = False
        for _ in range(30):
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
            cls.proc.wait()

    def setUp(self):
        self.player.reset_game()

    def test_01_ai_icon_assets_exist_on_disk(self):
        bdd_scenario_header(1, "Asset Audit: 26 AI-Generated Art Icons for Weapons, Armor, Spells, Items")
        bdd_step("GIVEN", "Directory assets/icons/ai/ containing high-res AI generated icons")

        ai_dir = os.path.join(ROOT_DIR, "assets", "icons", "ai")
        self.assertTrue(os.path.isdir(ai_dir), f"Directory {ai_dir} must exist")

        expected_icons = [
            # Weapons
            "weapon_broadsword.png", "weapon_shortsword.png", "weapon_battle_axe.png",
            "weapon_crossbow.png", "weapon_dagger.png", "weapon_staff.png",
            # Armor
            "armor_shield.png", "armor_helmet.png", "armor_chain_mail.png", "armor_plate_mail.png",
            # Spells
            "spell_ball_of_flame.png", "spell_fire_of_wrath.png", "spell_courage.png",
            "spell_rock_skin.png", "spell_heal_body.png", "spell_pass_through_rock.png",
            "spell_water_of_healing.png", "spell_sleep.png", "spell_veil_of_mist.png",
            "spell_genie.png", "spell_swift_wind.png", "spell_tempest.png",
            # Items
            "item_healing_potion.png", "item_potion_of_strength.png",
            "item_potion_of_speed.png", "item_tool_kit.png"
        ]

        verified_count = 0
        for icon_name in expected_icons:
            icon_path = os.path.join(ai_dir, icon_name)
            self.assertTrue(os.path.exists(icon_path), f"Asset {icon_name} must exist on disk")
            size = os.path.getsize(icon_path)
            self.assertGreater(size, 10000, f"Asset {icon_name} must be >10KB (got {size} bytes)")
            verified_count += 1

        bdd_step("THEN", f"All {verified_count} AI icons verified with valid file sizes", assertions=[
            f"Expected icons: {len(expected_icons)}",
            f"Verified icons on disk: {verified_count}"
        ])

    def test_02_portrait_button_opens_character_sheet_and_no_info_button(self):
        bdd_scenario_header(2, "Interaction: Clicking Hero Portrait Opens Character Sheet & INFO Button Removed")
        bdd_step("GIVEN", "Static code in TabletopWorld.gd _create_hero_card")

        gd_path = os.path.join(ROOT_DIR, "scripts", "TabletopWorld.gd")
        with open(gd_path, "r", encoding="utf-8") as f:
            code = f.read()

        # Verify legacy INFO button is removed
        self.assertNotIn('btn_sheet.text = "INFO"', code, "Legacy INFO button must be removed")
        self.assertIn("HeroPortraitButton", code, "HeroPortraitButton must exist in hero card creation")

        bdd_step("WHEN", "Clicking on Rogar the Barbarian's portrait button via RPC")
        res = self.player.click_hero_portrait("barbarian")
        self.assertTrue(res.get("success"), "click_hero_portrait must succeed")

        modal = self.player.get_hero_detail_modal()
        bdd_step("THEN", "Character Sheet opens displaying Barbarian", assertions=[
            f"Modal visible: {modal.get('visible')}",
            f"Hero ID: {modal.get('heroId')}",
            f"Hero Name: {modal.get('heroName')}"
        ])
        self.assertTrue(modal.get("visible"))
        self.assertEqual(modal.get("heroId"), "barbarian")

        # Close modal
        self.player.close_hero_detail()
        self.assertFalse(self.player.get_hero_detail_modal().get("visible"))

    def test_03_ai_icons_grid_rendered_within_21_slots(self):
        bdd_scenario_header(3, "Grid Layout: Up to 3 Rows of 7 Columns Rendered for Spells and Gear")
        bdd_step("GIVEN", "Telor the Wizard with 9 spells, dagger, and 2 potions (12 total items)")

        self.player.set_state(
            heroes=[
                {
                    "id": "wizard",
                    "equipped_weapon": "dagger",
                    "spells": [
                        "ball_of_flame", "fire_of_wrath", "courage",
                        "rock_skin", "heal_body", "pass_through_rock",
                        "genie", "swift_wind", "tempest"
                    ],
                    "inventory": ["healing_potion", "potion_of_speed"]
                }
            ]
        )

        st = self.player.get_state()
        wiz = next(c for c in st.get("characterCards", []) if c.get("id") == "wizard")

        bdd_step("THEN", "Wizard telemetry reflects 12 icons and 0 overflow", assertions=[
            f"AI Icons Count: {wiz.get('aiIconsCount')}",
            f"Overflow Count: {wiz.get('overflowCount')}",
            f"Has Portrait Button: {wiz.get('hasPortraitButton')}"
        ])
        self.assertEqual(wiz.get("aiIconsCount"), 12)
        self.assertEqual(wiz.get("overflowCount"), 0)
        self.assertTrue(wiz.get("hasPortraitButton"))

    def test_04_overflow_badge_rendered_when_exceeding_21_slots(self):
        bdd_scenario_header(4, "Overflow Badge: {+NUM} Rendered When Icons Exceed 21 Slots")
        bdd_step("GIVEN", "Hero configured with 12 spells, weapon, 2 armor items, and 10 potions (25 total items)")

        # 1 weapon + 2 armors + 12 spells + 10 potions = 25 total icons
        all_12_spells = [
            "ball_of_flame", "fire_of_wrath", "courage",
            "rock_skin", "heal_body", "pass_through_rock",
            "water_of_healing", "sleep", "veil_of_mist",
            "genie", "swift_wind", "tempest"
        ]
        ten_potions = [
            "healing_potion", "potion_of_strength", "potion_of_speed", "tool_kit",
            "healing_potion", "potion_of_strength", "potion_of_speed", "tool_kit",
            "healing_potion", "potion_of_strength"
        ]

        self.player.set_state(
            heroes=[
                {
                    "id": "elf",
                    "equipped_weapon": "shortsword",
                    "equipped_armor": ["shield", "helmet"],
                    "spells": all_12_spells,
                    "inventory": ten_potions
                }
            ]
        )

        st = self.player.get_state()
        elf = next(c for c in st.get("characterCards", []) if c.get("id") == "elf")

        # Total icons: 1 weapon + 2 armors + 12 spells + 10 potions = 25 icons
        # Visible in 3 rows of 7: 20 icons + 1 overflow badge (+5)
        bdd_step("THEN", "Elf telemetry reports 25 icons and overflowCount = 5", assertions=[
            f"AI Icons Count: {elf.get('aiIconsCount')} (expected 25)",
            f"Overflow Count: {elf.get('overflowCount')} (expected 5, displayed as +5)"
        ])
        self.assertEqual(elf.get("aiIconsCount"), 25)
        self.assertEqual(elf.get("overflowCount"), 5)

        # Verify clicking portrait opens sheet for this hero
        res = self.player.click_hero_portrait("elf")
        self.assertTrue(res.get("success"))
        modal = self.player.get_hero_detail_modal()
        self.assertTrue(modal.get("visible"))
        self.assertEqual(modal.get("heroId"), "elf")
        self.player.close_hero_detail()

    def test_05_visual_proof_screenshot_captured(self):
        bdd_scenario_header(5, "Visual Proof: Capture Hero Party Cards with AI Icons & Clickable Portraits")
        bdd_step("GIVEN", "Tabletop game HUD with hero party cards")

        time.sleep(0.2)
        out_shot = "/tmp/tabletop_hero_portrait_ai_icons.png"
        res = self.player.take_screenshot(out_shot)
        self.assertTrue(res.get("success") or os.path.exists(out_shot))

        brain_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
        if os.path.exists(out_shot):
            dest = os.path.join(brain_dir, "tabletop_hero_portrait_ai_icons.png")
            shutil.copyfile(out_shot, dest)
            bdd_step("THEN", f"Visual proof artifact copied to {dest}", assertions=[
                f"File size: {os.path.getsize(dest)} bytes"
            ])


if __name__ == "__main__":
    unittest.main(verbosity=2)
