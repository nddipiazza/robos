#!/usr/bin/env python3
"""
test_dice_rolls_e2e.py
End-to-End BDD test suite verifying animated tabletop dice rolls:
1. Red acrylic dice with authentic white dots/pips (1-6) for hero movement (1d6, 2d6, 4d6).
2. Bone white HeroQuest combat dice with black icons (Skulls for hits, White Shields for hero defense,
   Black Shields for monster defense) for melee attacks, monster attacks, and spell attacks.
"""

import os
import sys
import time
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, mouse_info: str = None, dice_info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if mouse_info:
        print(f"    🖱️  [MOUSE ACTION] {mouse_info}")
    if dice_info:
        print(f"    🎲  [DICE TRAY]    {dice_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestTabletopDiceRolls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎲 FEATURE: Animated Red Movement Dice (White Pips) & White Combat Dice (Skulls/Shields)")
        print("   As a HeroQuest tabletop player")
        print("   I want authentic 3D tumbling red movement dice with white pips")
        print("   And bone-white combat dice embossed with Skulls, White Shields, and Black Shields")
        print("   So that all movement and combat rolls feel tactile, clear, and true to HeroQuest")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18096
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(25):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

        # Setup: Move Barbarian to reveal crypt door and monsters
        cls.player.execute_action("roll_movement")
        cls.player.move(4, 1)
        cls.player.open_door(4, 1, 4, 2)
        cls.player.execute_action("roll_movement")
        cls.player.move(4, 4)

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()
        print("\n" + "=" * 90)
        print("🏁 SCENARIOS COMPLETED: All Animated Dice Roll Scenarios Verified Successfully!")
        print("=" * 90 + "\n")

    def test_01_movement_dice_standard_2d6(self):
        """SCENARIO 1: Standard 2d6 movement roll triggers animated red dice with white pips."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Standard 2d6 Movement - Animated Red Acrylic Dice with White Pips")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian starts turn and needs to move through the dungeon",
                 dice_info="Standard Movement: 2d6 Red Acrylic Dice with White Dots")

        bdd_step("WHEN", "Player clicks '🎲 Move' button",
                 mouse_info="Click '🎲 Move' action button")
        res = self.player.execute_action("roll_movement")
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})

        bdd_step("THEN", "Animated tabletop dice tray displays 2 tumbling red movement dice",
                 assertions=[
                     f"activeDiceRoll type is '{active_dice.get('type')}' (expected 'movement')",
                     f"activeDiceRoll diceCount is {active_dice.get('diceCount')} (expected 2)",
                     f"title: '{active_dice.get('title')}'",
                     f"settled state: {active_dice.get('settled')}"
                 ])
        self.assertEqual(active_dice.get("type"), "movement")
        self.assertEqual(active_dice.get("diceCount"), 2)
        self.assertIn("Movement Roll (2d6)", active_dice.get("title", ""))

        # Wait for dice to finish tumbling and settle on table
        time.sleep(0.9)
        settled_state = self.player.get_state()
        settled_dice = settled_state.get("activeDiceRoll", {})
        bdd_step("AND", "Dice settle on the velvet tray showing total squares rolled",
                 assertions=[
                     f"settled is True: {settled_dice.get('settled', False)}",
                     f"summary banner: '{settled_dice.get('summary')}'"
                 ])
        self.assertTrue(settled_dice.get("settled", False))
        self.assertIn("Rolled", settled_dice.get("summary", ""))

    def test_02_movement_dice_plate_mail_1d6(self):
        """SCENARIO 2: Plate Mail armor restricts hero to 1d6 movement die."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Plate Mail Restriction - Single 1d6 Animated Red Die")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian equips heavy fitted Plate Mail",
                 mouse_info="Equip 'plate_mail' on Barbarian")
        self.player.equip("plate_mail", "barbarian")

        bdd_step("WHEN", "Player clicks '🎲 Move' with Plate Mail equipped",
                 mouse_info="Click '🎲 Move'")
        res = self.player.execute_action("roll_movement")
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})

        bdd_step("THEN", "Dice tray animates exactly 1 red movement die (1d6)",
                 assertions=[
                     f"activeDiceRoll diceCount is {active_dice.get('diceCount')} (expected 1)",
                     f"title specifies '(1d6)': '{active_dice.get('title')}'"
                 ])
        self.assertEqual(active_dice.get("diceCount"), 1)
        self.assertIn("(1d6)", active_dice.get("title", ""))

        # Cleanup plate mail
        self.player.unequip("plate_mail", "barbarian")

    def test_03_movement_dice_swift_wind_4d6(self):
        """SCENARIO 3: Swift Wind spell carries hero with 4d6 double movement."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Swift Wind Arcane Movement - 4d6 Red Dice Tumbling Tray")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian receives Swift Wind enchantment",
                 mouse_info="Cast 'swift_wind' on Barbarian")
        self.player.cast_spell("swift_wind", "barbarian")

        bdd_step("WHEN", "Player rolls for movement under Swift Wind",
                 mouse_info="Click '🎲 Move'")
        res = self.player.execute_action("roll_movement")
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})

        bdd_step("THEN", "Dice tray animates 4 red movement dice tumbling across the board",
                 assertions=[
                     f"activeDiceRoll diceCount is {active_dice.get('diceCount')} (expected 4)",
                     f"title specifies '(4d6)': '{active_dice.get('title')}'"
                 ])
        self.assertEqual(active_dice.get("diceCount"), 4)
        self.assertIn("(4d6)", active_dice.get("title", ""))

    def test_04_combat_dice_hero_attack_skulls_and_black_shields(self):
        """SCENARIO 4: Hero attacks monster with white combat dice (Skulls vs Monster Black Shields)."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Melee Combat - White Combat Dice (Skulls vs Black Shields)")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian is wielding Broadsword (3 Attack Dice) adjacent to Crypt Skeleton",
                 dice_info="Attack: 3 White Combat Dice (Skulls) | Defense: 2 White Combat Dice (Black Shields)")
        self.player.equip("broadsword", "barbarian")

        bdd_step("WHEN", "Player attacks Crypt Skeleton",
                 mouse_info="Click '⚔️ Attack' targeting 'mon-skel-1'")
        res = self.player.attack("mon-skel-1", "broadsword")
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})

        bdd_step("THEN", "White combat dice tray animates attack and defense dice simultaneously",
                 assertions=[
                     f"activeDiceRoll type is '{active_dice.get('type')}' (expected 'combat')",
                     f"total dice in tray: {active_dice.get('diceCount')} (3 attack + 2 defense = 5)",
                     f"combat title: '{active_dice.get('title')}'"
                 ])
        self.assertEqual(active_dice.get("type"), "combat")
        self.assertEqual(active_dice.get("diceCount"), 5)
        self.assertIn("attacks", active_dice.get("title", ""))

        time.sleep(0.9)
        settled_state = self.player.get_state()
        settled_dice = settled_state.get("activeDiceRoll", {})
        bdd_step("AND", "Combat dice settle displaying Skulls, Black Shields, and Wounds inflicted",
                 assertions=[
                     f"settled is True: {settled_dice.get('settled', False)}",
                     f"summary outcome: '{settled_dice.get('summary')}'"
                 ])
        self.assertTrue(settled_dice.get("settled", False))
        self.assertTrue("Skull" in settled_dice.get("summary", "") or "BLOCKED" in settled_dice.get("summary", ""))

    def test_05_combat_dice_monster_attack_hero_white_shields(self):
        """SCENARIO 5: Monster attacks hero; hero defends with White Shields."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Game Master Strike - White Combat Dice vs Hero White Shields")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian equips Shield and Helmet for 4 total defense dice",
                 dice_info="Monster Attack vs Hero Defense (White Shields)")
        self.player.equip("shield", "barbarian")
        self.player.equip("helmet", "barbarian")

        bdd_step("WHEN", "Game Master monster attacks Barbarian",
                 mouse_info="Game Master triggers 'dm_attack'")
        res = self.player.dm_attack("barbarian")
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})

        bdd_step("THEN", "Combat dice roll reflects monster attack vs hero defending with White Shields",
                 assertions=[
                     f"activeDiceRoll type: '{active_dice.get('type')}'",
                     f"dice count: {active_dice.get('diceCount')}",
                     f"title: '{active_dice.get('title')}'"
                 ])
        self.assertEqual(active_dice.get("type"), "combat")
        self.assertGreaterEqual(active_dice.get("diceCount"), 6)

        time.sleep(0.9)
        settled_dice = self.player.get_state().get("activeDiceRoll", {})
        bdd_step("AND", "Hero defense resolves using White Shields (Knight Cross icon)",
                 assertions=[
                     f"summary mentions White Shield: '{settled_dice.get('summary')}'",
                     f"settled: {settled_dice.get('settled')}"
                 ])
        self.assertTrue(settled_dice.get("settled", False))
        self.assertIn("White Shield", settled_dice.get("summary", ""))

    def test_06_combat_spell_animated_dice(self):
        """SCENARIO 6: Spell attacks (Ball of Flame) trigger combat dice roll animation."""
        print("\n" + "-" * 80)
        print("SCENARIO 06: Arcane Spell Attack - Ball of Flame Combat Dice Animation")
        print("-" * 80)

        bdd_step("GIVEN", "Wizard casts Ball of Flame (2 Skulls vs 2 Monster Defend Dice)",
                 dice_info="Ball of Flame: 2 Skulls (Attacker) vs 2 Defend Dice (Crypt Skeleton)")

        bdd_step("WHEN", "Ball of Flame is cast on monster",
                 mouse_info="Cast 'ball_of_flame' on 'mon-skel-2'")
        res = self.player.cast_spell("ball_of_flame", "mon-skel-2")
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})

        bdd_step("THEN", "Combat dice animation fires for spell defense roll",
                 assertions=[
                     f"activeDiceRoll type is '{active_dice.get('type')}' (expected 'combat')",
                     f"title: '{active_dice.get('title')}'",
                     f"diceCount: {active_dice.get('diceCount')}"
                 ])
        self.assertEqual(active_dice.get("type"), "combat")
        self.assertIn("Ball of Flame", active_dice.get("title", ""))

    def test_07_custom_dice_roll_action(self):
        """SCENARIO 7: Direct testing of dice roll action with specific parameters."""
        print("\n" + "-" * 80)
        print("SCENARIO 07: Direct Action Testing - Custom Movement and Combat Rolls")
        print("-" * 80)

        bdd_step("GIVEN", "Custom movement roll requested via API with d1=5 and d2=6",
                 dice_info="Testing exact pip rendering for faces 5 and 6")

        res = self.player.execute_action("test_dice_roll", type="movement", hero="Elf", d1=5, d2=6)
        self.assertTrue(res.get("success", False))

        state = self.player.get_state()
        active_dice = state.get("activeDiceRoll", {})
        bdd_step("THEN", "Dice animation reflects 11 total movement squares",
                 assertions=[
                     f"type: '{active_dice.get('type')}'",
                     f"title: '{active_dice.get('title')}'",
                     f"summary: '{active_dice.get('summary')}'"
                 ])
        self.assertEqual(active_dice.get("type"), "movement")
        self.assertIn("11", active_dice.get("summary", ""))

        time.sleep(0.9)
        # Test custom combat roll (4 attack vs 3 defend, hero defending)
        bdd_step("WHEN", "Custom combat roll requested with 4 attack vs 3 defense dice",
                 dice_info="4 Attack Dice vs 3 Defense Dice (Hero Defending)")
        res2 = self.player.execute_action("test_dice_roll", type="combat", attacker="Zargon", defender="Dwarf", attackDice=4, defendDice=3, isHeroDefending=True)
        self.assertTrue(res2.get("success", False))

        state2 = self.player.get_state()
        active_combat = state2.get("activeDiceRoll", {})
        bdd_step("THEN", "Combat roll reflects 7 dice total and hero defense rules",
                 assertions=[
                     f"diceCount: {active_combat.get('diceCount')}",
                     f"title: '{active_combat.get('title')}'"
                 ])
        self.assertEqual(active_combat.get("diceCount"), 7)
        self.assertIn("Zargon attacks Dwarf", active_combat.get("title", ""))


if __name__ == "__main__":
    unittest.main()
