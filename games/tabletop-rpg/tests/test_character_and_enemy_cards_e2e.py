#!/usr/bin/env python3
"""
test_character_and_enemy_cards_e2e.py
Comprehensive End-to-End BDD test suite verifying:
1. Condensed Character Cards for all 4 party heroes (Barbarian, Dwarf, Elf, Wizard)
   displaying real-time Body Points (BP), Mind Points (MP), attack/defend dice,
   equipped weapons/armor, and active condition/buff pills.
2. Discovered Enemy Cards tracking all foes ever sighted on the tabletop,
   complete with real-time visibility indicators:
   - [👁️ VISIBLE]: Enemy currently within line-of-sight or revealed room.
   - [👁️‍🗨️ (not visible)]: Enemy lost from sight (corridor out-of-range/around corners).
   - [💀 DEFEATED]: Enemy slain in battle with red-tinted defeated card styling.
3. Active-turn leader glow and seamless turn transitions across the party.
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


def bdd_step(step_type: str, text: str, mouse_info: str = None, card_info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if mouse_info:
        print(f"    🖱️  [MOUSE ACTION] {mouse_info}")
    if card_info:
        print(f"    🎴  [CARD STATE]   {card_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestCharacterAndEnemyCardsE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎴 FEATURE: Condensed Character Cards & Discovered Enemy Cards (Visible / Not Visible)")
        print("   As a HeroQuest tabletop player")
        print("   I want condensed character cards for the full hero party showing BP/MP bars and buffs")
        print("   And persistent enemy cards for all discovered monsters showing current sight status")
        print("   So that party health, equipment, and tactical enemy intelligence are clear at a glance")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18099
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

    def test_01_initial_hero_cards_and_empty_foes_panel(self):
        """Scenario 1: Initial state renders all 4 heroes in party; 0 enemies discovered."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Hero Party Cards Initialized & Empty Discovered Foes Panel")
        print("-" * 80)

        bdd_step("GIVEN", "Game begins with four HeroQuest adventurers entering the catacombs",
                 card_info="Party: Barbarian, Dwarf, Elf, Wizard")

        st = self.player.get_state()
        char_cards = st.get("characterCards", [])
        enemy_cards = st.get("enemyCards", [])

        bdd_step("THEN", "Character cards are created for all 4 heroes",
                 assertions=[
                     f"Total character cards: {len(char_cards)} (expected 4)",
                     f"Discovered enemies count: {st.get('discoveredEnemiesCount', -1)} (expected 0)"
                 ])
        self.assertEqual(len(char_cards), 4, "Must have exactly 4 hero character cards")
        self.assertEqual(st.get("discoveredEnemiesCount", -1), 0, "No enemies should be discovered yet")
        self.assertEqual(len(enemy_cards), 0, "Enemy cards array must be empty initially")

        # Verify Barbarian (Conan)
        barb = next((c for c in char_cards if c.get("id") == "barbarian"), None)
        self.assertIsNotNone(barb, "Barbarian card must exist")
        self.assertEqual(barb.get("name"), "Barbarian")
        self.assertEqual(barb.get("current_bp"), 8)
        self.assertEqual(barb.get("max_bp"), 8)
        self.assertEqual(barb.get("current_mp"), 2)
        self.assertEqual(barb.get("max_mp"), 2)
        self.assertEqual(barb.get("attackDice"), 3)
        self.assertEqual(barb.get("defendDice"), 2)
        self.assertTrue(barb.get("isActive"), "Barbarian begins as active hero")
        self.assertTrue(barb.get("isOnBoard"), "Barbarian starts on the board")
        self.assertEqual(barb.get("weapon"), "broadsword")

        # Verify Dwarf
        dwarf = next((c for c in char_cards if c.get("id") == "dwarf"), None)
        self.assertIsNotNone(dwarf, "Dwarf card must exist")
        self.assertEqual(dwarf.get("current_bp"), 7)
        self.assertEqual(dwarf.get("max_bp"), 7)
        self.assertEqual(dwarf.get("current_mp"), 3)
        self.assertEqual(dwarf.get("max_mp"), 3)
        self.assertFalse(dwarf.get("isActive"), "Dwarf is not active yet")
        self.assertFalse(dwarf.get("isOnBoard"), "Dwarf remains off-board until his turn")

        # Verify Elf
        elf = next((c for c in char_cards if c.get("id") == "elf"), None)
        self.assertIsNotNone(elf, "Elf card must exist")
        self.assertEqual(elf.get("current_bp"), 6)
        self.assertEqual(elf.get("max_bp"), 6)
        self.assertEqual(elf.get("current_mp"), 4)
        self.assertEqual(elf.get("max_mp"), 4)

        # Verify Wizard
        wiz = next((c for c in char_cards if c.get("id") == "wizard"), None)
        self.assertIsNotNone(wiz, "Wizard card must exist")
        self.assertEqual(wiz.get("current_bp"), 4)
        self.assertEqual(wiz.get("max_bp"), 4)
        self.assertEqual(wiz.get("current_mp"), 6)
        self.assertEqual(wiz.get("max_mp"), 6)

        bdd_step("AND", "Active turn golden glow is awarded to starting hero (Barbarian)",
                 card_info="Barbarian: ★ ACTIVE | Others: [Off Board]",
                 assertions=["Barbarian isActive: True", "Dwarf/Elf/Wizard isActive: False"])

    def test_02_room_reveal_enemy_discovery(self):
        """Scenario 2: Opening Crypt door discovers 2 skeletons with [👁️ VISIBLE] badges."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Kicking Open Crypt Door Reveals Foes with [👁️ VISIBLE] Badges")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian moves to hallway door outside Northwest Crypt at (4, 1)",
                 mouse_info="Click 'Move' and step along corridor to (4, 1)")

        for _ in range(3):
            self.player.execute_action("roll_movement")
            self.player.move(4, 1)

        bdd_step("WHEN", "Barbarian kicks open the heavy wooden door into the crypt",
                 mouse_info="Click '🚪 Open Door' at (4, 1) -> (4, 2)")

        open_res = self.player.open_door(4, 1, 4, 2)
        self.assertTrue(open_res.get("success"), "Opening crypt door must succeed")

        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])

        bdd_step("THEN", "Two crypt skeletons are discovered and added to Discovered Foes",
                 card_info="Discovered Foes: 2 Sighted | 0 Defeated",
                 assertions=[
                     f"discoveredEnemiesCount: {st.get('discoveredEnemiesCount')} (expected 2)",
                     f"visibleEnemiesCount: {st.get('visibleEnemiesCount')} (expected 2)",
                     f"enemyCards count: {len(enemy_cards)} (expected 2)"
                 ])
        self.assertEqual(st.get("discoveredEnemiesCount"), 2)
        self.assertEqual(st.get("visibleEnemiesCount"), 2)
        self.assertEqual(len(enemy_cards), 2)

        # Check skeleton properties
        skel1 = next((e for e in enemy_cards if e.get("id") == "mon-skel-1"), None)
        self.assertIsNotNone(skel1, "mon-skel-1 card must exist")
        self.assertEqual(skel1.get("statusBadge"), "visible")
        self.assertTrue(skel1.get("isVisible"))
        self.assertTrue(skel1.get("isAlive"))
        self.assertEqual(skel1.get("current_bp"), 1)
        self.assertEqual(skel1.get("max_bp"), 1)
        self.assertEqual(skel1.get("attackDice"), 2)
        self.assertEqual(skel1.get("defendDice"), 2)

        skel2 = next((e for e in enemy_cards if e.get("id") == "mon-skel-2"), None)
        self.assertIsNotNone(skel2, "mon-skel-2 card must exist")
        self.assertEqual(skel2.get("statusBadge"), "visible")
        self.assertTrue(skel2.get("isVisible"))

    def test_03_active_status_effects_on_cards(self):
        """Scenario 3: Status spells display condition pills on character and enemy cards."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Status Spells & Buffs Render Colored Badges on Cards")
        print("-" * 80)

        bdd_step("GIVEN", "Wizard casts 'Rock Skin' and 'Courage' on the Barbarian",
                 mouse_info="Cast 'rock_skin' & 'courage' on target 'barbarian'")

        self.player.cast_spell("rock_skin", target="barbarian")
        self.player.cast_spell("courage", target="barbarian")

        st = self.player.get_state()
        char_cards = st.get("characterCards", [])
        barb = next(c for c in char_cards if c.get("id") == "barbarian")

        bdd_step("THEN", "Barbarian card displays [Rock Skin] and [Courage] pills with augmented stats",
                 card_info=f"Barbarian Buffs: {barb.get('statusEffects')}",
                 assertions=[
                     "rock_skin in Barbarian statusEffects: True",
                     "courage in Barbarian statusEffects: True",
                     f"Barbarian attackDice: {barb.get('attackDice')} (3 base + 2 courage = 5)",
                     f"Barbarian defendDice: {barb.get('defendDice')} (2 base + 1 rock skin = 3)"
                 ])
        self.assertIn("rock_skin", barb.get("statusEffects", []))
        self.assertIn("courage", barb.get("statusEffects", []))
        self.assertEqual(barb.get("attackDice"), 5)
        self.assertEqual(barb.get("defendDice"), 3)

        bdd_step("WHEN", "Wizard casts 'Sleep' on Crypt Skeleton #1",
                 mouse_info="Cast 'sleep' on 'mon-skel-1'")

        self.player.cast_spell("sleep", target="mon-skel-1")

        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])
        skel1 = next(e for e in enemy_cards if e.get("id") == "mon-skel-1")

        bdd_step("THEN", "Skeleton card displays condition pill [💤 Sleeping]",
                 card_info=f"Skeleton Status: {skel1.get('statusEffects')}",
                 assertions=["sleep in skeleton statusEffects: True"])
        self.assertIn("sleep", skel1.get("statusEffects", []))

    def test_04_no_longer_visible_indicator(self):
        """Scenario 4: Corridor enemy loses line-of-sight and transitions to [👁️‍🗨️ (not visible)]."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Corridor Foe Losing Line of Sight Transitions to [👁️‍🗨️ (not visible)]")
        print("-" * 80)

        bdd_step("GIVEN", "A wandering goblin appears around corridor corner at (7, 1)",
                 mouse_info="Summon monster 'mon-gob-1' at corridor (7, 1)")

        # Summon wandering monster at corridor (7, 1)
        res = self.player.execute_action("summon_monster", x=7, y=1, bp=1, name="Sneaky Goblin")
        self.assertTrue(res.get("success"), "Summon monster must succeed")
        gob_id = str(res.get("monster", {}).get("id"))

        # Barbarian is currently at (4, 1), which has straight LOS down row 1 to (7, 1)
        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])
        gob_card = next((e for e in enemy_cards if e.get("id") == gob_id), None)
        self.assertIsNotNone(gob_card, "Goblin card must be created in Discovered Foes")

        bdd_step("THEN", "Goblin is initially visible down the straight corridor",
                 card_info=f"Goblin card: {gob_card.get('statusBadge')}",
                 assertions=[
                     f"Goblin statusBadge: '{gob_card.get('statusBadge')}' (expected 'visible')",
                     "Goblin isVisible: True"
                 ])
        self.assertEqual(gob_card.get("statusBadge"), "visible")
        self.assertTrue(gob_card.get("isVisible"))

        bdd_step("WHEN", "Goblin moves around the south corner to (7, 5) out of Barbarian's line of sight",
                 mouse_info="Reposition Goblin to (7, 5) behind solid stone corridor wall")

        # Reposition Goblin to (7, 5) which is behind a wall corner from (4, 1)
        self.player.execute_action("set_monster_pos", monsterId=gob_id, x=7, y=5)

        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])
        gob_card_after = next((e for e in enemy_cards if e.get("id") == gob_id), None)
        self.assertIsNotNone(gob_card_after, "Goblin card must persist in discovered list")

        bdd_step("THEN", "Goblin card dynamically transitions to [👁️‍🗨️ (not visible)] with dimmed styling",
                 card_info=f"Goblin card: {gob_card_after.get('statusBadge')} (dimmed opacity)",
                 assertions=[
                     f"Goblin statusBadge: '{gob_card_after.get('statusBadge')}' (expected 'not_visible')",
                     "Goblin isVisible: False",
                     "Goblin isAlive: True (still alive, just unseen)"
                 ])
        self.assertEqual(gob_card_after.get("statusBadge"), "not_visible")
        self.assertFalse(gob_card_after.get("isVisible"))
        self.assertTrue(gob_card_after.get("isAlive"))

    def test_05_defeated_enemy_card_indicator(self):
        """Scenario 5: Defeating an enemy updates its card to [💀 DEFEATED] with 0 BP."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Slaying an Enemy Updates Card to [💀 DEFEATED] with 0 BP")
        print("-" * 80)

        bdd_step("GIVEN", "Crypt Skeleton #1 is asleep with 1 Body Point in the revealed room",
                 card_info="Skeleton #1: BP 1/1, isAlive=True")

        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])
        skel1 = next(e for e in enemy_cards if e.get("id") == "mon-skel-1")
        self.assertTrue(skel1.get("isAlive"))

        bdd_step("WHEN", "Barbarian attacks and crushes Crypt Skeleton #1",
                 mouse_info="Attack 'mon-skel-1' with Broadsword (5 combat dice under Courage)")

        # Slay skeleton by setting BP to 0 / killing it
        self.player.execute_action("set_monster_bp", monsterId="mon-skel-1", bp=0)

        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])
        skel1_after = next(e for e in enemy_cards if e.get("id") == "mon-skel-1")

        bdd_step("THEN", "Skeleton card is preserved in Discovered Foes with [💀 DEFEATED] badge and 0 BP",
                 card_info=f"Skeleton #1: {skel1_after.get('statusBadge')} (BP: {skel1_after.get('current_bp')}/1)",
                 assertions=[
                     f"statusBadge: '{skel1_after.get('statusBadge')}' (expected 'defeated')",
                     f"current_bp: {skel1_after.get('current_bp')} (expected 0)",
                     "isAlive: False",
                     f"defeatedEnemiesCount: {st.get('defeatedEnemiesCount')} (expected 1)"
                 ])
        self.assertEqual(skel1_after.get("statusBadge"), "defeated")
        self.assertEqual(skel1_after.get("current_bp"), 0)
        self.assertFalse(skel1_after.get("isAlive"))
        self.assertEqual(st.get("defeatedEnemiesCount"), 1)

    def test_06_hero_turn_cycling_active_glow_transfer(self):
        """Scenario 6: Ending turn transfers active glow to Dwarf and places him on the board."""
        print("\n" + "-" * 80)
        print("SCENARIO 06: Ending Turn Advances Active Glow to Dwarf on the Table")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian completes turn and clicks 'End Turn'",
                 mouse_info="Click '⏭️ End Turn'")

        self.player.execute_action("end_turn")

        st = self.player.get_state()
        char_cards = st.get("characterCards", [])

        barb = next(c for c in char_cards if c.get("id") == "barbarian")
        dwarf = next(c for c in char_cards if c.get("id") == "dwarf")

        bdd_step("THEN", "Dwarf enters board at spiral stair and receives ★ ACTIVE card glow",
                 card_info=f"Dwarf isActive: {dwarf.get('isActive')}, isOnBoard: {dwarf.get('isOnBoard')}",
                 assertions=[
                     "Dwarf isActive: True",
                     "Dwarf isOnBoard: True",
                     "Barbarian isActive: False",
                     "Barbarian isOnBoard: True (still on board)"
                 ])
        self.assertTrue(dwarf.get("isActive"), "Dwarf must now be active hero")
        self.assertTrue(dwarf.get("isOnBoard"), "Dwarf must now be on the board")
        self.assertFalse(barb.get("isActive"), "Barbarian is no longer active")
        self.assertTrue(barb.get("isOnBoard"), "Barbarian remains on the board")


if __name__ == "__main__":
    unittest.main()
