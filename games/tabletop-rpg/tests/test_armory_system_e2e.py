#!/usr/bin/env python3
"""
test_armory_system_e2e.py
BDD End-to-End Test Suite verifying the authentic HeroQuest Armory Equipment Shop.

HeroQuest Rules & Requirements:
- After Elf spell selection, if the player/party has money, the Armory opens automatically.
- Player can crack open the Armory anytime via the hotbar "🛡️ Armory" action button.
- The Armory provides authentic equipment: weapons, armor, tools, and potions.
- Class restrictions: Wizard cannot wear metal armor (Chain Mail, Plate Mail, Helmet, Shield) or use heavy weapons.
- Buying an item deducts hero gold, adds to inventory, and equips if weapon/armor.
- Buying Shield or Helmet increases Defend Dice (+1 each).
- Buying Broadsword increases Attack Dice to 3.
- Buying is rejected if the hero has insufficient gold or violates class restrictions.
- Player can toggle between heroes (Barbarian, Dwarf, Elf, Wizard) in the Armory tabs.
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


class TestArmorySystemE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18105

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🛡️  FEATURE: Authentic HeroQuest Armory Equipment Shop")
        print("   Rules: Visit Armory after Elf Spell Draft or via Hotbar to purchase gear & weapons")
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
        for _ in range(35):
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

    def test_01_armory_catalog_and_party_gold(self):
        bdd_scenario_header(1, "Armory Catalog Verification & Party Gold Telemetry")
        bdd_step("GIVEN", "Game loads active quest with player heroes")
        st = self.ai.get_state()

        bdd_step("WHEN", "Inspecting armory catalog and total party gold")
        catalog = st.get("armoryCatalog", [])
        self.assertGreaterEqual(len(catalog), 10, "Armory catalog must contain authentic HeroQuest equipment")

        item_ids = [item.get("id") for item in catalog]
        self.assertIn("dagger", item_ids)
        self.assertIn("shield", item_ids)
        self.assertIn("helmet", item_ids)
        self.assertIn("shortsword", item_ids)
        self.assertIn("broadsword", item_ids)
        self.assertIn("chain_mail", item_ids)
        self.assertIn("plate_mail", item_ids)

        party_gold = st.get("partyTotalGold", 0)
        bdd_step("THEN", f"Catalog contains {len(catalog)} equipment items and party gold is {party_gold} GP",
                 assertions=[
                     f"Item count: {len(catalog)}",
                     f"Essential weapons/armor present: {', '.join(item_ids[:6])}...",
                     f"Party gold: {party_gold}"
                 ])

    def test_02_manual_armory_access_via_hotbar(self):
        bdd_scenario_header(2, "Manual Armory Access via Hotbar Button")
        bdd_step("GIVEN", "Party has 0 gold initially, so armory button is disabled with helpful notice")
        self.assertFalse(self.ai.is_armory_open())
        click_zero = self.ai.click_action_button("armory")
        self.assertFalse(click_zero.get("success"), "Clicking armory with 0 gold should fail gracefully")
        self.assertTrue(click_zero.get("disabled"), "Button should be disabled when party has 0 gold")
        self.assertIn("no gold", click_zero.get("reason", "").lower())
        bdd_step("THEN", "Armory unavailable feedback received", assertions=[
            f"Reason: {click_zero.get('reason')}"
        ])

        bdd_step("WHEN", "Party earns 150 gold and clicks 'armory' action button on hotbar")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 150
        self.ai.set_state(heroes=heroes)

        click_res = self.ai.click_action_button("armory")
        self.assertTrue(click_res.get("success"), "Clicking armory hotbar button should succeed when party has gold")

        bdd_step("THEN", "Armory modal opens and reports visible in scene telemetry")
        st = self.ai.get_state()
        self.assertTrue(st.get("armoryOpen") or st.get("armoryModalVisible"))
        self.assertTrue(st.get("scene", {}).get("ui", {}).get("modal", {}).get("armoryModalVisible"))

        bdd_step("WHEN", "Player calls close_armory()")
        close_res = self.ai.close_armory()
        self.assertTrue(close_res.get("success"))

        bdd_step("THEN", "Armory modal is cleanly hidden")
        st_after = self.ai.get_state()
        self.assertFalse(st_after.get("armoryOpen", False))
        self.assertFalse(st_after.get("armoryModalVisible", False))

    def test_03_auto_open_armory_after_elf_spell_selection(self):
        bdd_scenario_header(3, "Auto-Opening Armory After Elf Spell Selection When Party Has Gold")
        bdd_step("GIVEN", "Elf hero has 250 Gold in pouch")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "elf":
                h["gold"] = 250
        self.ai.set_state(heroes=heroes)

        st = self.ai.get_state()
        self.assertGreater(st.get("partyTotalGold", 0), 0)

        bdd_step("WHEN", "Elf opens spell draft and confirms Water magic")
        self.ai.execute_action("open_spell_selection")
        # Select water magic and confirm
        res = self.ai.execute_action("select_elf_element", element="water", confirm=True)
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Elf spell draft closes AND Armory modal opens automatically!")
        st_after = self.ai.get_state()
        elf_modal_vis = st_after.get("elfSpellModalVisible") or st_after.get("scene", {}).get("ui", {}).get("modal", {}).get("elfSpellSelectModalVisible")
        armory_vis = st_after.get("armoryOpen") or st_after.get("armoryModalVisible") or st_after.get("scene", {}).get("ui", {}).get("modal", {}).get("armoryModalVisible")

        self.assertFalse(elf_modal_vis, "Elf spell modal should be closed")
        self.assertTrue(armory_vis, "Armory modal should automatically open because party has gold")
        bdd_step("THEN", "Auto-transition successful", assertions=[
            "elfSpellModalVisible = False",
            "armoryModalVisible = True"
        ])

        # Clean up
        self.ai.close_armory()

    def test_04_purchase_armor_deducts_gold_and_increases_defend_dice(self):
        bdd_scenario_header(4, "Purchasing Shield Boosts Defend Dice by +1")
        bdd_step("GIVEN", "Barbarian starts with 2 Defend Dice and 300 GP")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 300
                h["equipped_armor"] = []
        self.ai.set_state(heroes=heroes)

        # Confirm baseline defend dice
        st0 = self.ai.get_state()
        barb0 = next(h for h in st0.get("heroes") if h.get("id") == "barbarian")
        base_defend = barb0.get("defendDice")
        self.assertEqual(base_defend, 2, "Barbarian base defend dice should be 2")

        bdd_step("WHEN", "Barbarian purchases 'shield' (100 GP) from the Armory")
        buy_res = self.ai.buy_armory_item("barbarian", "shield")
        self.assertTrue(buy_res.get("success"), f"Purchase failed: {buy_res.get('error')}")
        self.assertEqual(buy_res.get("remainingGold"), 200)

        bdd_step("THEN", "Barbarian gold decreases to 200 GP and Defend Dice increases to 3")
        st1 = self.ai.get_state()
        barb1 = next(h for h in st1.get("heroes") if h.get("id") == "barbarian")
        self.assertEqual(barb1.get("gold"), 200)
        self.assertIn("shield", barb1.get("equipped_armor", []))
        self.assertEqual(barb1.get("defendDice"), 3, "Equipping shield must increase defend dice to 3")
        bdd_step("THEN", "Shield equipped & stats updated", assertions=[
            "Remaining Gold: 200 GP",
            "Equipped Armor: ['shield']",
            "Defend Dice: 2 -> 3"
        ])

    def test_05_purchase_weapon_increases_attack_dice(self):
        bdd_scenario_header(5, "Purchasing Broadsword Upgrades Weapon & Attack Dice")
        bdd_step("GIVEN", "Elf starts with Shortsword (2 Attack Dice) and 400 GP")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "elf":
                h["gold"] = 400
                h["equipped_weapon"] = "shortsword"
        self.ai.set_state(heroes=heroes)

        st0 = self.ai.get_state()
        elf0 = next(h for h in st0.get("heroes") if h.get("id") == "elf")
        self.assertEqual(elf0.get("attackDice"), 2)

        bdd_step("WHEN", "Elf purchases 'broadsword' (250 GP, 3 Attack Dice) from the Armory")
        buy_res = self.ai.buy_armory_item("elf", "broadsword")
        self.assertTrue(buy_res.get("success"), f"Purchase failed: {buy_res.get('error')}")
        self.assertEqual(buy_res.get("remainingGold"), 150)

        bdd_step("THEN", "Elf equipped_weapon becomes 'broadsword' and Attack Dice increases to 3")
        st1 = self.ai.get_state()
        elf1 = next(h for h in st1.get("heroes") if h.get("id") == "elf")
        self.assertEqual(elf1.get("gold"), 150)
        self.assertEqual(elf1.get("equipped_weapon"), "broadsword")
        self.assertEqual(elf1.get("attackDice"), 3, "Broadsword must confer 3 attack dice")
        bdd_step("THEN", "Weapon upgraded & stats updated", assertions=[
            "Remaining Gold: 150 GP",
            "Equipped Weapon: 'broadsword'",
            "Attack Dice: 2 -> 3"
        ])

    def test_06_insufficient_gold_rejected(self):
        bdd_scenario_header(6, "Purchase Rejection When Hero Has Insufficient Gold")
        bdd_step("GIVEN", "Dwarf has only 25 Gold in pouch")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "dwarf":
                h["gold"] = 25
        self.ai.set_state(heroes=heroes)

        bdd_step("WHEN", "Dwarf attempts to buy 'helmet' (125 GP)")
        buy_res = self.ai.buy_armory_item("dwarf", "helmet")

        bdd_step("THEN", "Transaction is rejected with clear error message")
        self.assertFalse(buy_res.get("success"))
        self.assertIn("Insufficient gold", buy_res.get("error", ""))

        st = self.ai.get_state()
        dwarf = next(h for h in st.get("heroes") if h.get("id") == "dwarf")
        self.assertEqual(dwarf.get("gold"), 25, "Gold must not be deducted on failure")
        bdd_step("THEN", "Rejection asserted", assertions=[
            "success = False",
            f"error: {buy_res.get('error')}",
            "Dwarf gold unchanged (25 GP)"
        ])

    def test_07_wizard_class_restriction_rejected(self):
        bdd_scenario_header(7, "HeroQuest Class Restriction: Wizard Cannot Buy Metal Armor")
        bdd_step("GIVEN", "Wizard has 1000 Gold (wealthy wizard)")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "wizard":
                h["gold"] = 1000
        self.ai.set_state(heroes=heroes)

        bdd_step("WHEN", "Wizard attempts to buy 'chain_mail' (metal armor forbidden to Wizard)")
        buy_res = self.ai.buy_armory_item("wizard", "chain_mail")

        bdd_step("THEN", "Transaction is strictly rejected due to class restriction")
        self.assertFalse(buy_res.get("success"))
        self.assertIn("class restrictions", buy_res.get("error", ""))

        st = self.ai.get_state()
        wiz = next(h for h in st.get("heroes") if h.get("id") == "wizard")
        self.assertEqual(wiz.get("gold"), 1000)
        self.assertNotIn("chain_mail", wiz.get("equipped_armor", []))
        bdd_step("THEN", "Class restriction asserted", assertions=[
            "success = False",
            f"error: {buy_res.get('error')}",
            "Wizard equipped_armor does not contain chain_mail"
        ])

    def test_08_hero_tab_selection_in_armory(self):
        bdd_scenario_header(8, "Armory Hero Tab Switching")
        bdd_step("GIVEN", "Armory modal is open")
        self.ai.open_armory("barbarian")

        bdd_step("WHEN", "Player switches selected hero to 'dwarf'")
        sel_res = self.ai.select_armory_hero("dwarf")
        self.assertTrue(sel_res.get("success"))
        self.assertEqual(sel_res.get("selectedHeroId"), "dwarf")

        bdd_step("THEN", "Armory telemetry reflects dwarf as selected hero")
        st = self.ai.get_state()
        self.assertEqual(st.get("selectedArmoryHeroId"), "dwarf")

        bdd_step("WHEN", "Player switches selected hero to 'wizard'")
        sel_res2 = self.ai.select_armory_hero("wizard")
        self.assertTrue(sel_res2.get("success"))
        self.assertEqual(sel_res2.get("selectedHeroId"), "wizard")

        st2 = self.ai.get_state()
        self.assertEqual(st2.get("selectedArmoryHeroId"), "wizard")
        bdd_step("THEN", "Hero tabs correctly switch active context", assertions=[
            "Selected Hero: 'dwarf' -> 'wizard'"
        ])

        self.ai.close_armory()

    def test_09_screenshot_proof_of_armory_modal(self):
        bdd_scenario_header(9, "Visual Proof: Capture Tabletop Armory Modal Screenshot")
        bdd_step("GIVEN", "Party has gold and Armory is open showing available gear")
        heroes = self.ai.get_state().get("heroes", [])
        for h in heroes:
            h["gold"] = 350
        self.ai.set_state(heroes=heroes)

        self.ai.open_armory("barbarian")
        time.sleep(0.2)

        bdd_step("WHEN", "Capturing viewport screenshot to /tmp/tabletop_armory_modal.png")
        out_shot = "/tmp/tabletop_armory_modal.png"
        res = self.ai.take_screenshot(out_shot)
        self.assertTrue(res.get("success"), f"Screenshot capture failed: {res}")
        self.assertTrue(os.path.exists(out_shot), f"File {out_shot} does not exist")
        bdd_step("THEN", f"Armory screenshot verified at {out_shot}", assertions=[
            f"File size: {os.path.getsize(out_shot)} bytes"
        ])


if __name__ == "__main__":
    unittest.main(verbosity=2)
