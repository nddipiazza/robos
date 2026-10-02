#!/usr/bin/env python3
"""
test_elf_spell_selection_e2e.py
BDD End-to-End Test Suite verifying the authentic HeroQuest Elf Spell Selection Draft.

HeroQuest Rules:
- The Elf chooses 1 Elemental Deck (3 spells) first.
- The Wizard memorizes the remaining 3 Elemental Decks (9 spells).
- Barbarian and Dwarf are non-casters (0 spells).
- Game start modal and telemetry state synchronize the drafted grimoire.
"""

import os
import sys
import time
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, TESTS_DIR)

from rpc_ai.tabletop_rpc_ai import TabletopRPCAI
from tabletop_snapshot_diff import diff_snapshots


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"🔮 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestElfSpellSelectionE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18099

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🧝 FEATURE: HeroQuest Elf Elemental Spell Selection on Quest Start")
        print("   Rule: Elf chooses 1 elemental deck (3 spells) first; Wizard takes the other 3 (9 spells)")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--skip-spell-select"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopRPCAI(port=cls.port, human_delay=0.05)
        connected = False
        for _ in range(30):
            if cls.ai.check_health():
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
        self.ai.reset_game()

    def test_01_initial_spell_allocation_telemetry(self):
        bdd_scenario_header(1, "Initial Spell Allocation Ingested from Cartridge")
        bdd_step("GIVEN", "Game loads active cartridge in player mode")
        st = self.ai.get_state()

        bdd_step("THEN", "Telemetry reports spell allocation with Elf and Wizard spells")
        alloc = st.get("spellAllocation", {})
        elf_elem = alloc.get("elfElement", "")
        elf_spells = alloc.get("elfSpells", [])
        wiz_spells = alloc.get("wizardSpells", [])

        self.assertIn(elf_elem, ["water", "earth", "fire", "air"])
        self.assertEqual(len(elf_spells), 3, "Elf must have exactly 3 spells")
        self.assertEqual(len(wiz_spells), 9, "Wizard must have exactly 9 spells")
        bdd_step("THEN", f"Elf has {len(elf_spells)} spells ({elf_elem}) and Wizard has {len(wiz_spells)} spells",
                 assertions=[
                     f"elfElement: {elf_elem}",
                     f"elfSpells count: {len(elf_spells)}",
                     f"wizardSpells count: {len(wiz_spells)}"
                 ])

    def test_02_open_and_close_elf_spell_selection_modal(self):
        bdd_scenario_header(2, "Open and Close In-Engine Elf Spell Selection Modal")
        bdd_step("WHEN", "Calling action 'open_spell_selection'")
        open_res = self.ai.execute_action("open_spell_selection")
        self.assertTrue(open_res.get("success"))
        self.assertTrue(open_res.get("modal_visible"))

        st = self.ai.get_state()
        modal_vis = st.get("elfSpellModalVisible") or st.get("scene", {}).get("ui", {}).get("modal", {}).get("elfSpellSelectModalVisible")
        self.assertTrue(modal_vis, "Spell select modal must be visible in telemetry")
        bdd_step("THEN", "Modal becomes visible in game scene", assertions=["elfSpellModalVisible = True"])

        bdd_step("WHEN", "Calling action 'close_spell_selection'")
        close_res = self.ai.execute_action("close_spell_selection")
        self.assertTrue(close_res.get("success"))
        st_after = self.ai.get_state()
        modal_vis_after = st_after.get("elfSpellModalVisible") or st_after.get("scene", {}).get("ui", {}).get("modal", {}).get("elfSpellSelectModalVisible")
        self.assertFalse(modal_vis_after, "Spell select modal must be hidden after close")
        bdd_step("THEN", "Modal is hidden in game scene", assertions=["elfSpellModalVisible = False"])

    def test_03_elf_drafts_earth_magic(self):
        bdd_scenario_header(3, "Elf Drafts Earth Magic (Defense & Healing)")
        bdd_step("GIVEN", "Player opens spell selection and drafts Earth Magic for Elf")
        res = self.ai.execute_action("select_elf_element", element="earth", confirm=True)
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("elf_element"), "earth")

        st = self.ai.get_state()
        alloc = st.get("spellAllocation", {})
        elf_spells = alloc.get("elfSpells", [])
        wiz_spells = alloc.get("wizardSpells", [])

        self.assertEqual(alloc.get("elfElement"), "earth")
        self.assertEqual(len(elf_spells), 3)
        self.assertEqual(set(elf_spells), {"heal_body", "pass_through_rock", "rock_skin"})
        self.assertEqual(len(wiz_spells), 9)

        # Wizard must NOT have any Earth spells
        for sp in ["heal_body", "pass_through_rock", "rock_skin"]:
            self.assertNotIn(sp, wiz_spells, f"Wizard must not possess Elf's drafted spell: {sp}")

        bdd_step("THEN", "Elf receives Heal Body, Pass Through Rock, Rock Skin; Wizard takes remaining 9",
                 assertions=[
                     "Elf Earth spells: heal_body, pass_through_rock, rock_skin",
                     "Wizard 9 spells contain Water, Fire, and Air but 0 Earth spells"
                 ])

    def test_04_elf_drafts_fire_magic(self):
        bdd_scenario_header(4, "Elf Drafts Fire Magic (Direct Damage & Attack Buffs)")
        bdd_step("WHEN", "Elf drafts Fire Magic deck")
        res = self.ai.execute_action("select_elf_element", element="fire", confirm=True)
        self.assertTrue(res.get("success"))

        st = self.ai.get_state()
        alloc = st.get("spellAllocation", {})
        elf_spells = alloc.get("elfSpells", [])
        wiz_spells = alloc.get("wizardSpells", [])

        self.assertEqual(alloc.get("elfElement"), "fire")
        self.assertEqual(set(elf_spells), {"ball_of_flame", "fire_of_wrath", "courage"})
        self.assertEqual(len(wiz_spells), 9)

        for sp in ["ball_of_flame", "fire_of_wrath", "courage"]:
            self.assertNotIn(sp, wiz_spells, f"Wizard must not possess Fire spell {sp} when Elf drafts Fire")

        bdd_step("THEN", "Elf has Fire spells and Wizard has Earth, Water, Air",
                 assertions=[
                     "Elf Fire spells: ball_of_flame, fire_of_wrath, courage",
                     "Wizard has 0 Fire spells"
                 ])

    def test_05_elf_drafts_water_magic(self):
        bdd_scenario_header(5, "Elf Drafts Water Magic (Restoration & Stealth)")
        bdd_step("WHEN", "Elf drafts Water Magic deck")
        res = self.ai.execute_action("select_elf_element", element="water", confirm=True)
        self.assertTrue(res.get("success"))

        st = self.ai.get_state()
        alloc = st.get("spellAllocation", {})
        elf_spells = alloc.get("elfSpells", [])
        wiz_spells = alloc.get("wizardSpells", [])

        self.assertEqual(alloc.get("elfElement"), "water")
        self.assertEqual(set(elf_spells), {"water_of_healing", "sleep", "veil_of_mist"})
        self.assertEqual(len(wiz_spells), 9)

        for sp in ["water_of_healing", "sleep", "veil_of_mist"]:
            self.assertNotIn(sp, wiz_spells)

        bdd_step("THEN", "Elf has Water spells and Wizard has Earth, Fire, Air",
                 assertions=[
                     "Elf Water spells: water_of_healing, sleep, veil_of_mist",
                     "Wizard has 0 Water spells"
                 ])

    def test_06_hero_cards_reflect_active_spells(self):
        bdd_scenario_header(6, "Sidebar Hero Cards Reflect Drafted Spells")
        self.ai.execute_action("select_elf_element", element="earth", confirm=True)
        st = self.ai.get_state()

        heroes = st.get("heroes", [])
        elf_h = next((h for h in heroes if str(h.get("id")) == "elf"), None)
        wiz_h = next((h for h in heroes if str(h.get("id")) == "wizard"), None)
        barb_h = next((h for h in heroes if str(h.get("id")) == "barbarian"), None)
        dwarf_h = next((h for h in heroes if str(h.get("id")) == "dwarf"), None)

        self.assertIsNotNone(elf_h)
        self.assertIsNotNone(wiz_h)
        self.assertEqual(len(elf_h.get("spells", [])), 3)
        self.assertEqual(len(wiz_h.get("spells", [])), 9)
        self.assertEqual(len(barb_h.get("spells", [])), 0)
        self.assertEqual(len(dwarf_h.get("spells", [])), 0)

        bdd_step("THEN", "Elf card has 3 spells, Wizard has 9, Barbarian and Dwarf have 0",
                 assertions=[
                     "Elf spells: 3",
                     "Wizard spells: 9",
                     "Barbarian spells: 0",
                     "Dwarf spells: 0"
                 ])


if __name__ == "__main__":
    unittest.main()
