#!/usr/bin/env python3
"""
test_potion_of_defense_usage_e2e.py
BDD End-to-End Test Suite verifying that:
1. Potion of Defense can be consumed via direct use_item RPC / Backpack action, applying +2 Defend Dice.
2. Clicking Potion of Defense in hero card activates hero-targeting mode (target_type="hero").
3. Selecting a target hero (ally or self) consumes 1 Potion of Defense and grants +2 Defend Dice buff.
4. Hero defend dice calculation get_hero_defend_dice() incorporates the +2 bonus and displays on cards.
5. In combat, hero defends against monster attacks with +2 defend dice, and the temporary warding dissipates afterwards.
6. Board tile click targeting on a hero correctly resolves and applies the buff.
"""

import os
import sys
import time
import unittest
import subprocess
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, TESTS_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"🛡️ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestPotionOfDefenseUsageE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18142

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🛡️ FEATURE: Potion of Defense Consumption & +2 Defend Dice Buff System")
        print("   Rule: Hero holding Potion of Defense can click and use it on self or ally")
        print("   Rule: Potion grants +2 Defend Dice on hero's next defense and consumes item")
        print("=" * 90)

        play_script = os.path.join(ROOT_DIR, "play.sh")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [play_script, "--headless", "--role=player"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.08)
        if not cls.player.wait_for_ready(12.0):
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError("Tabletop test server failed to become ready.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            try:
                cls.proc.terminate()
                cls.proc.wait(timeout=2.0)
            except Exception:
                cls.proc.kill()

    def setUp(self):
        self.player.reset_game()

    def test_01_use_item_potion_defense_self(self):
        bdd_scenario_header(1, "Direct Potion of Defense Consumption Grants +2 Defend Dice")

        bdd_step("GIVEN", "Barbarian starts with base 2 Defend Dice and receives Potion of Defense in Backpack")
        st_initial = self.player.get_state()
        barb_initial = next((h for h in st_initial.get("heroes", []) if h.get("id") == "barbarian"), {})
        base_def = int(barb_initial.get("defendDice", 2))
        self.assertEqual(base_def, 2, "Barbarian base defend dice should be 2")

        # Give Barbarian potion_defense in inventory
        heroes_conf = st_initial.get("heroes", [])
        for h in heroes_conf:
            if h.get("id") == "barbarian":
                h["inventory"] = ["broadsword", "potion_defense"]
                h["potion_defense_active"] = False
                h["potion_defense_bonus"] = 0
        self.player.set_state(heroes=heroes_conf, activeHero=0)

        bdd_step("WHEN", "Barbarian consumes Potion of Defense via use_item")
        res = self.player.execute_action("use_item", heroId="barbarian", itemId="potion_defense")

        bdd_step("THEN", "Action succeeds, potion is consumed, and +2 Defend Dice buff is active",
                 assertions=[
                     f"success: {res.get('success')} == True",
                     f"action: '{res.get('action')}' == 'defense_bonus'",
                     f"defense_bonus: {res.get('defense_bonus')} == 2"
                 ])
        self.assertTrue(res.get("success"), f"use_item should succeed: {res.get('error')}")
        self.assertEqual(res.get("action"), "defense_bonus")
        self.assertEqual(res.get("defense_bonus"), 2)

        st_after = self.player.get_state()
        barb_after = next((h for h in st_after.get("heroes", []) if h.get("id") == "barbarian"), {})
        new_def = int(barb_after.get("defendDice", 2))
        effs = barb_after.get("activeEffects", [])
        inv = barb_after.get("inventory", [])

        bdd_step("AND", "Hero stats reflect 4 Defend Dice (2 base + 2 potion) and item is consumed",
                 assertions=[
                     f"defendDice: {new_def} == 4",
                     f"'potion_defense' in activeEffects: {'potion_defense' in effs}",
                     f"'potion_defense' not in inventory: {'potion_defense' not in inv}"
                 ])
        self.assertEqual(new_def, 4, f"Expected 4 defend dice (2 base + 2 potion bonus), got {new_def}")
        self.assertIn("potion_defense", effs, "potion_defense should be in activeEffects")
        self.assertNotIn("potion_defense", inv, "potion_defense should be removed from inventory")

    def test_02_targeting_item_use_on_ally(self):
        bdd_scenario_header(2, "Dwarf Uses Potion of Defense on Barbarian Ally via Targeting")

        bdd_step("GIVEN", "Dwarf has Potion of Defense; Barbarian has standard 2 Defend Dice")
        st = self.player.get_state()
        heroes_conf = st.get("heroes", [])
        for h in heroes_conf:
            if h.get("id") == "dwarf":
                h["inventory"] = ["shortsword", "potion_defense"]
            elif h.get("id") == "barbarian":
                h["inventory"] = ["broadsword"]
                h["potion_defense_active"] = False
                h["potion_defense_bonus"] = 0
        self.player.set_state(heroes=heroes_conf, activeHero=1)  # Dwarf is active

        bdd_step("WHEN", "Dwarf activates targeting for Potion of Defense")
        t_res = self.player.execute_action("toggle_targeting", type="item", id="potion_defense", hero_id="dwarf")
        self.assertTrue(t_res.get("success"), "Targeting toggle should succeed")
        t_data = t_res.get("targeting", {})

        bdd_step("THEN", "Targeting is active with target_type='hero'",
                 assertions=[
                     f"active: {t_res.get('active')} == True",
                     f"target_type: '{t_data.get('target_type')}' == 'hero'"
                 ])
        self.assertTrue(t_res.get("active"), "Targeting should be active")
        self.assertEqual(t_data.get("target_type"), "hero", "Potion targeting must seek a 'hero' target")

        bdd_step("WHEN", "Dwarf targets Barbarian ally")
        sel_res = self.player.execute_action("select_target", target_id="barbarian", target_type="hero")

        bdd_step("THEN", "Targeting resolves successfully, Dwarf's potion is consumed, Barbarian receives buff",
                 assertions=[
                     f"select success: {sel_res.get('success')} == True",
                     f"action: '{sel_res.get('action')}' == 'defense_bonus'",
                     f"target: '{sel_res.get('target')}' == 'barbarian'"
                 ])
        self.assertTrue(sel_res.get("success"), f"Target selection should succeed: {sel_res.get('error')}")
        self.assertEqual(sel_res.get("action"), "defense_bonus")
        self.assertEqual(sel_res.get("target"), "barbarian")

        st_post = self.player.get_state()
        dwarf_post = next((h for h in st_post.get("heroes", []) if h.get("id") == "dwarf"), {})
        barb_post = next((h for h in st_post.get("heroes", []) if h.get("id") == "barbarian"), {})

        self.assertNotIn("potion_defense", dwarf_post.get("inventory", []), "Dwarf inventory must consume potion")
        self.assertEqual(int(barb_post.get("defendDice", 2)), 4, "Barbarian must now have 4 Defend Dice")
        self.assertIn("potion_defense", barb_post.get("activeEffects", []), "Barbarian must have potion_defense effect")

    def test_03_targeting_item_use_on_board_tile(self):
        bdd_scenario_header(3, "Targeting Potion on Board Tile Position Resolves to Resident Hero")

        bdd_step("GIVEN", "Elf at board position (3, 8) has potion_of_defense")
        st = self.player.get_state()
        elf_pos = [3, 8]

        heroes_conf = st.get("heroes", [])
        for h in heroes_conf:
            if h.get("id") == "elf":
                h["inventory"] = ["shortsword", "potion_of_defense"]
                h["grid_pos"] = elf_pos
                h["potion_defense_active"] = False
        self.player.set_state(heroes=heroes_conf, activeHero=2)  # Elf active

        bdd_step("WHEN", "Elf activates targeting for potion_of_defense")
        t_res = self.player.execute_action("toggle_targeting", type="item", id="potion_of_defense", hero_id="elf")
        self.assertTrue(t_res.get("active"), "Targeting should be active")

        bdd_step("WHEN", f"User clicks board tile ({elf_pos[0]}, {elf_pos[1]}) occupied by Elf")
        click_res = self.player.execute_action("select_target", tile=elf_pos)

        bdd_step("THEN", "Click resolves targeting, consumes potion, and buffs Elf",
                 assertions=[
                     f"click success: {click_res.get('success')} == True",
                     f"action: '{click_res.get('action')}' == 'defense_bonus'",
                     f"target: '{click_res.get('target')}' == 'elf'"
                 ])
        self.assertTrue(click_res.get("success"), f"Tile click resolve should succeed: {click_res.get('error')}")
        self.assertEqual(click_res.get("target"), "elf")

        st_post = self.player.get_state()
        elf_post = next((h for h in st_post.get("heroes", []) if h.get("id") == "elf"), {})
        self.assertEqual(int(elf_post.get("defendDice", 2)), 4, "Elf defend dice must be 4 (2 + 2)")
        self.assertNotIn("potion_of_defense", elf_post.get("inventory", []), "Potion consumed from pack")

    def test_04_combat_defense_roll_and_dissipation(self):
        bdd_scenario_header(4, "Defense Buff Grants +2 Dice in Combat and Dissipates After Defense")

        bdd_step("GIVEN", "Barbarian with active Potion of Defense (+2 DEF DICE) and an adjacent Goblin")
        st = self.player.get_state()
        heroes_conf = st.get("heroes", [])
        for h in heroes_conf:
            if h.get("id") == "barbarian":
                h["grid_pos"] = [3, 8]
                h["current_bp"] = 8
                h["potion_defense_active"] = True
                h["potion_defense_bonus"] = 2

        # Spawn adjacent Goblin at (3, 7)
        monsters_conf = [
            {
                "id": "test_goblin",
                "name": "Goblin",
                "slug": "goblin",
                "grid_pos": [3, 7],
                "attackDice": 2,
                "defendDice": 1,
                "bodyPoints": 1,
                "current_bp": 1,
                "is_alive": True
            }
        ]
        self.player.set_state(heroes=heroes_conf, monsters=monsters_conf, activeHero=0)

        st_check = self.player.get_state()
        barb_check = next((h for h in st_check.get("heroes", []) if h.get("id") == "barbarian"), {})
        self.assertEqual(int(barb_check.get("defendDice", 2)), 4, "Barbarian must enter combat with 4 Defend Dice")

        bdd_step("WHEN", "Goblin attacks Barbarian")
        combat_res = self.player.execute_action("dm_attack_hero", monster_id="test_goblin", target_hero_id="barbarian")

        bdd_step("THEN", "Combat rolls were resolved and Potion of Defense warding dissipates after the defense",
                 assertions=[
                     f"combat completed: {isinstance(combat_res, dict)}",
                     "potion_defense_active dissipated: True"
                 ])

        st_final = self.player.get_state()
        barb_final = next((h for h in st_final.get("heroes", []) if h.get("id") == "barbarian"), {})
        final_def = int(barb_final.get("defendDice", 2))
        effs_final = barb_final.get("activeEffects", [])

        bdd_step("AND", "Barbarian defend dice returns to base 2 and potion_defense is removed from activeEffects",
                 assertions=[
                     f"defendDice: {final_def} == 2",
                     f"'potion_defense' not in activeEffects: {'potion_defense' not in effs_final}"
                 ])
        self.assertEqual(final_def, 2, f"Expected defend dice to return to base 2, got {final_def}")
        self.assertNotIn("potion_defense", effs_final, "potion_defense should dissipate after defending")

    def test_05_character_cards_show_pd_buff_and_screenshot(self):
        bdd_scenario_header(5, "Character Cards Reflect Buff Badge & HUD Status")

        bdd_step("GIVEN", "Barbarian drinks Potion of Defense")
        st = self.player.get_state()
        heroes_conf = st.get("heroes", [])
        for h in heroes_conf:
            if h.get("id") == "barbarian":
                h["inventory"] = ["broadsword", "potion_defense"]
                h["potion_defense_active"] = False
                h["potion_defense_bonus"] = 0
        self.player.set_state(heroes=heroes_conf, activeHero=0)

        # Drink potion
        self.player.execute_action("use_item", heroId="barbarian", itemId="potion_defense")

        st_active = self.player.get_state()
        barb_card = next((c for c in st_active.get("characterCards", []) if c.get("id") == "barbarian"), {})

        bdd_step("THEN", "Barbarian character card reflects defendDice=4",
                 assertions=[
                     f"characterCards defendDice: {barb_card.get('defendDice')} == 4"
                 ])
        self.assertEqual(int(barb_card.get("defendDice", 2)), 4)

        # Capture visual proof
        out_png = "/tmp/tabletop_potion_defense_used_proof.png"
        self.player.execute_action("take_screenshot", path=out_png)
        self.assertTrue(os.path.exists(out_png), "Proof screenshot must be generated")
        print(f"    ✔  [SCREENSHOT] Captured HUD proof to {out_png} ({os.path.getsize(out_png)} bytes)")


if __name__ == "__main__":
    unittest.main()
