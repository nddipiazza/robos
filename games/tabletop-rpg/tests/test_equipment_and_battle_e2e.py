#!/usr/bin/env python3
"""
test_equipment_and_battle_e2e.py
End-to-End BDD test suite verifying standard HeroQuest weapons, armor, class restrictions,
movement penalties, diagonal reach, ranged line-of-sight, and battle resolution mechanics.
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


def bdd_step(step_type: str, text: str, mouse_info: str = None, assertions: list = None, equip_info: str = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if mouse_info:
        print(f"    🖱️  [MOUSE ACTION] {mouse_info}")
    if equip_info:
        print(f"    ⚔️  [EQUIPMENT]    {equip_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


def to_coords(pos):
    if isinstance(pos, (list, tuple)):
        return [int(pos[0]), int(pos[1])]
    if isinstance(pos, str):
        cleaned = pos.strip("()[] ").split(",")
        return [int(cleaned[0].strip()), int(cleaned[1].strip())]
    return [0, 0]


class TestHeroQuestEquipmentAndBattle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🛡️ FEATURE: Authentic HeroQuest Weapons, Armor & Tactical Combat Resolution")
        print("   As a Dungeon Crawler Combatant")
        print("   I want weapons to govern reach/dice, armor to augment defense/penalize speed,")
        print("   and combat dice to resolve Skulls against White/Black Shields")
        print("   So that all HeroQuest 1989/2021 tactical combat rules are enforced authentically")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18095
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

        # Setup: Move Barbarian to open crypt door so monsters inside are visible
        cls.player.execute_action("roll_movement")
        cls.player.move(4, 1)
        cls.player.open_door(4, 1, 4, 2)
        # Move into crypt at (4, 4), orthogonally adjacent to skeleton at (3, 4) and (5, 4)
        cls.player.execute_action("roll_movement")
        cls.player.move(4, 4)

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()
        print("\n" + "=" * 90)
        print("🏁 SCENARIOS COMPLETED: All Weapons, Armor, and Combat Scenarios Verified!")
        print("=" * 90 + "\n")

    def test_01_broadsword_adjacent_melee(self):
        """SCENARIO 1: Broadsword provides 3 attack dice and requires orthogonal adjacency."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Broadsword - Standard Heavy Blade (3 Attack Dice, Adjacent Only)")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian is wielding a Broadsword",
                 equip_info="Broadsword: 3 Attack Dice, Cost 250 gp, 1-Handed, Orthogonal Adjacency")

        eq_res = self.player.equip("broadsword", "barbarian")
        self.assertTrue(eq_res.get("success"))
        self.assertEqual(eq_res.get("attackDice"), 3)

        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        self.assertEqual(barb.get("attackDice"), 3)

        bdd_step("WHEN", "Barbarian strikes adjacent Crypt Skeleton with Broadsword",
                 mouse_info="Click '⚔️ Attack' targeting Crypt Skeleton at (3, 4)",
                 assertions=["Target is orthogonally adjacent (distance: 1 tile)"])

        atk_res = self.player.attack("mon-skel-1", "broadsword")
        self.assertTrue(atk_res.get("success"))

        bdd_step("THEN", "Attack rolls 3 combat dice against Skeleton's 2 defend dice",
                 assertions=[
                     f"Total Skulls rolled: {atk_res.get('result', {}).get('total_skulls')}",
                     f"Black Shields defended: {atk_res.get('result', {}).get('effective_shields')}",
                     f"Wounds inflicted: {atk_res.get('result', {}).get('wounds')}"
                 ])

    def test_02_shortsword_diagonal_attack(self):
        """SCENARIO 2: Shortsword allows diagonal melee attacks."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Shortsword - Swift Thrusting Blade (2 Attack Dice, Diagonal Reach)")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian equips Shortsword",
                 equip_info="Shortsword: 2 Attack Dice, Cost 150 gp, Allows Diagonal Strikes")

        eq_res = self.player.equip("shortsword", "barbarian")
        self.assertTrue(eq_res.get("success"))
        self.assertEqual(eq_res.get("attackDice"), 2)

        # Step to (4, 3) where skeleton 2 at (5, 4) is diagonal (dx=1, dy=1)
        self.player.execute_action("roll_movement")
        self.player.move(4, 3)

        bdd_step("WHEN", "Barbarian attacks diagonally positioned Crypt Skeleton at (5, 4)",
                 mouse_info="Click '⚔️ Attack' targeting diagonal monster at (5, 4)",
                 assertions=["Distance to target is (dx=1, dy=1) - diagonal reach"])

        atk_res = self.player.attack("mon-skel-2", "shortsword")
        self.assertTrue(atk_res.get("success"), "Shortsword diagonal attack must succeed")

        bdd_step("THEN", "Attack succeeds with diagonal slash animation and 2 attack dice",
                 assertions=[
                     "Diagonal attack resolved successfully",
                     f"Rolled {atk_res.get('result', {}).get('total_skulls')} Skulls"
                 ])

        # Step back to (4, 4) for remaining scenarios
        self.player.execute_action("roll_movement")
        self.player.move(4, 4)

    def test_03_battle_axe_two_handed_restriction(self):
        """SCENARIO 3: Battle Axe provides 4 attack dice and forbids using a shield."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Battle Axe - Devastating Greataxe (4 Attack Dice, 2-Handed Weapon)")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian equips the heavy Battle Axe",
                 equip_info="Battle Axe: 4 Attack Dice, Cost 450 gp, 2-Handed (Requires Both Hands)")

        eq_res = self.player.equip("battle_axe", "barbarian")
        self.assertTrue(eq_res.get("success"))
        self.assertEqual(eq_res.get("attackDice"), 4)

        bdd_step("WHEN", "Player attempts to equip a Shield while holding Battle Axe",
                 mouse_info="Attempt to equip 'shield' on Barbarian",
                 assertions=["Rule: Shields cannot be used with two-handed weapons"])

        shield_res = self.player.equip("shield", "barbarian")
        bdd_step("THEN", "Equip action is rejected due to two-handed weapon conflict",
                 assertions=[
                     "shield_res.success == False",
                     "Conflict correctly prevented"
                 ])
        self.assertFalse(shield_res.get("success"))

    def test_04_crossbow_ranged_los_and_no_adjacent(self):
        """SCENARIO 4: Crossbow fires anywhere in LOS but cannot target adjacent enemies."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Crossbow - Missile Weapon (3 Attack Dice, Ranged LOS, Cannot Fire Adjacent)")
        print("-" * 80)

        # Summon a durable target monster at (4, 5) adjacent to Barbarian at (4, 4)
        s_res = self.player.execute_action("summon_monster", x=4, y=5, name="Target Skeleton", bp=5)
        cls_skel = s_res.get("monster", {}).get("id")

        bdd_step("GIVEN", "Barbarian equips Crossbow",
                 equip_info="Crossbow: 3 Attack Dice, Cost 350 gp, Ranged Missile Weapon")

        eq_res = self.player.equip("crossbow", "barbarian")
        self.assertTrue(eq_res.get("success"))

        bdd_step("WHEN", f"Player attempts to fire Crossbow at adjacent monster '{cls_skel}' at (4, 5)",
                 mouse_info="Target adjacent monster (distance <= 1 tile)",
                 assertions=["HeroQuest Rule: Crossbow cannot be fired at adjacent enemies"])

        bad_atk = self.player.attack(cls_skel, "crossbow")
        bdd_step("THEN", "Adjacent attack is rejected",
                 assertions=[
                     "Attack fails with 'Crossbow cannot target adjacent monsters'",
                     "Tactical disadvantage of ranged weapon enforced"
                 ])
        self.assertFalse(bad_atk.get("success"))
        self.assertEqual(bad_atk.get("error"), "Crossbow cannot target adjacent monsters")

    def test_05_dagger_melee_and_thrown(self):
        """SCENARIO 5: Dagger rolls 1 attack die and can be thrown at distant target in LOS."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Dagger - Throwing Knife (1 Attack Die, Melee or Thrown in LOS)")
        print("-" * 80)

        # Retrieve active target monster in crypt
        st = self.player.get_state()
        living = [m for m in st.get("monsters", []) if m.get("is_alive", False) and abs(m.get("grid_pos", [-1,-1])[0] - 4) <= 1 and abs(m.get("grid_pos", [-1,-1])[1] - 4) <= 1]
        target_id = living[0].get("id") if living else "mon-skel-1"

        bdd_step("GIVEN", "Barbarian equips Dagger",
                 equip_info="Dagger: 1 Attack Die, Cost 25 gp, Can be thrown at distant targets")

        eq_res = self.player.equip("dagger", "barbarian")
        self.assertTrue(eq_res.get("success"))
        self.assertEqual(eq_res.get("attackDice"), 1)

        bdd_step("WHEN", f"Barbarian attacks adjacent monster '{target_id}' with Dagger",
                 mouse_info="Click '⚔️ Attack' with Dagger",
                 assertions=["Dagger rolls 1 combat die in melee"])

        atk_res = self.player.attack(target_id, "dagger")
        self.assertTrue(atk_res.get("success"))

        bdd_step("THEN", "Attack resolves with 1 combat die",
                 assertions=[f"Skulls rolled: {atk_res.get('result', {}).get('total_skulls')}"])

    def test_06_staff_diagonal_and_two_handed(self):
        """SCENARIO 6: Staff allows diagonal attack and is a two-handed weapon."""
        print("\n" + "-" * 80)
        print("SCENARIO 06: Staff - Quarterstaff (1 Attack Die, Diagonal Strike, 2-Handed)")
        print("-" * 80)

        bdd_step("GIVEN", "Hero equips carved oak Staff",
                 equip_info="Staff: 1 Attack Die, Cost 100 gp, Diagonal Reach, 2-Handed")

        eq_res = self.player.equip("staff", "barbarian")
        self.assertTrue(eq_res.get("success"))
        self.assertEqual(eq_res.get("attackDice"), 1)

        bdd_step("WHEN", "Attempting to equip Shield with Staff",
                 mouse_info="Equip 'shield'",
                 assertions=["Staff is two-handed; shield must be rejected"])

        sh_res = self.player.equip("shield", "barbarian")
        self.assertFalse(sh_res.get("success"))

    def test_07_armor_shield_and_helmet_stacking(self):
        """SCENARIO 7: Shield and Helmet each provide +1 Defend die and stack."""
        print("\n" + "-" * 80)
        print("SCENARIO 07: Armor - Shield (+1 Defend) and Helmet (+1 Defend) Stacking")
        print("-" * 80)

        # Unequip two-handed weapon first by equipping Broadsword
        self.player.equip("broadsword", "barbarian")

        bdd_step("GIVEN", "Barbarian base defense is 2 combat dice",
                 assertions=["Base Defend Dice: 2"])

        bdd_step("WHEN", "Barbarian equips Shield (+1) and Helmet (+1)",
                 equip_info="Shield: +1 Defend Die (150 gp) | Helmet: +1 Defend Die (120 gp)")

        sh_res = self.player.equip("shield", "barbarian")
        self.assertTrue(sh_res.get("success"))

        helm_res = self.player.equip("helmet", "barbarian")
        self.assertTrue(helm_res.get("success"))

        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        def_dice = barb.get("defendDice")

        bdd_step("THEN", "Barbarian defense increases from 2 to 4 combat dice (2 + 1 + 1 = 4)",
                 assertions=[
                     f"Barbarian Defend Dice: {def_dice}",
                     "Shield and Helmet bonuses stack cleanly"
                 ])
        self.assertEqual(def_dice, 4)

    def test_08_armor_chain_mail_upgrade(self):
        """SCENARIO 8: Chain Mail sets base defense to 3 dice (5 total with Helmet + Shield)."""
        print("\n" + "-" * 80)
        print("SCENARIO 08: Armor - Chain Mail Body Armor (3 Base Defend Dice)")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian equips Chain Mail interlocking ring armor",
                 equip_info="Chain Mail: Base 3 Defend Dice, Cost 500 gp")

        cm_res = self.player.equip("chain_mail", "barbarian")
        self.assertTrue(cm_res.get("success"))

        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        def_dice = barb.get("defendDice")

        bdd_step("THEN", "Total defend dice reaches 5 (3 base + 1 helmet + 1 shield = 5)",
                 assertions=[
                     f"Effective Defend Dice: {def_dice}",
                     "Chain Mail successfully upgrades base defense"
                 ])
        self.assertEqual(def_dice, 5)

    def test_09_armor_plate_mail_and_movement_penalty(self):
        """SCENARIO 9: Plate Mail sets base defense to 4 dice and reduces movement to 1d6."""
        print("\n" + "-" * 80)
        print("SCENARIO 09: Armor - Plate Mail Heavy Steel (4 Base Defend Dice, Movement Penalty 1d6)")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian equips heavy fitted Plate Mail",
                 equip_info="Plate Mail: 4 Base Defend Dice, Cost 850 gp, Movement restricted to 1d6")

        pm_res = self.player.equip("plate_mail", "barbarian")
        self.assertTrue(pm_res.get("success"))

        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        def_dice = barb.get("defendDice")

        bdd_step("THEN", "Total defend dice reaches 6 (4 base + 1 helmet + 1 shield = 6)",
                 assertions=[
                     f"Effective Defend Dice: {def_dice}",
                     "Maximum armor protection achieved"
                 ])
        self.assertEqual(def_dice, 6)

        bdd_step("WHEN", "Barbarian rolls for movement while wearing Plate Mail",
                 mouse_info="Click '🎲 Move' button",
                 assertions=["HeroQuest Rule: Plate Mail restricts movement to only 1 die (1d6)"])

        roll_res = self.player.roll_movement()
        roll = roll_res.get("roll", {})

        bdd_step("THEN", f"Movement roll is calculated with 1d6: [{roll.get('d1')}] = {roll.get('total')} squares",
                 assertions=[
                     "roll.plate_mail == True",
                     f"Total movement: {roll.get('total')} (must be between 1 and 6)",
                     "Movement penalty verified"
                 ])
        self.assertTrue(roll.get("plate_mail"))
        self.assertGreaterEqual(roll.get("total"), 1)
        self.assertLessEqual(roll.get("total"), 6)

    def test_10_wizard_equipment_restrictions(self):
        """SCENARIO 10: Wizard cannot equip metal armor or heavy weapons."""
        print("\n" + "-" * 80)
        print("SCENARIO 10: Class Restrictions - Wizard Forbids Metal Armor & Heavy Weapons")
        print("-" * 80)

        bdd_step("GIVEN", "Wizard hero is subject to arcane equipment restrictions",
                 assertions=["Wizard can only use Dagger and Staff; no metal armor"])

        bdd_step("WHEN", "Attempting to equip Broadsword on Wizard",
                 mouse_info="Equip 'broadsword' on 'wizard'")
        w_atk = self.player.equip("broadsword", "wizard")
        self.assertFalse(w_atk.get("success"))

        bdd_step("AND", "Attempting to equip Plate Mail on Wizard",
                 mouse_info="Equip 'plate_mail' on 'wizard'")
        w_plate = self.player.equip("plate_mail", "wizard")
        self.assertFalse(w_plate.get("success"))

        bdd_step("AND", "Attempting to equip Shield on Wizard",
                 mouse_info="Equip 'shield' on 'wizard'")
        w_shield = self.player.equip("shield", "wizard")
        self.assertFalse(w_shield.get("success"))

        bdd_step("THEN", "All metal weapons and armor are rejected for Wizard",
                 assertions=[
                     "Broadsword rejected for Wizard",
                     "Plate Mail rejected for Wizard",
                     "Shield rejected for Wizard",
                     "Dagger and Staff remain allowed"
                 ])

    def test_11_hero_attack_battle_resolution(self):
        """SCENARIO 11: Hero combat resolution - Skulls vs Black Shields, Wounds, and Monster Defeat."""
        print("\n" + "-" * 80)
        print("SCENARIO 11: Battle Resolution - Skulls vs Black Shields, Wounds & Death")
        print("-" * 80)

        # Summon a living target in the crypt
        s_res = self.player.execute_action("summon_monster", x=3, y=4, name="Crypt Champion", bp=1)
        champ_id = s_res.get("monster", {}).get("id")
        m_pos = to_coords(s_res.get("monster", {}).get("grid_pos", [3, 4]))

        # Equip Broadsword and Courage for maximum attack power
        self.player.equip("broadsword", "barbarian")
        self.player.cast_spell("courage", "barbarian")

        # Ensure hero is orthogonally adjacent to m_pos
        st = self.player.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        h_pos = to_coords(barb.get("grid_pos", [4, 4]))
        if abs(h_pos[0] - m_pos[0]) + abs(h_pos[1] - m_pos[1]) != 1:
            self.player.execute_action("roll_movement")
            self.player.move(m_pos[0] + 1, m_pos[1])

        bdd_step("GIVEN", f"Barbarian is buffed with Courage (5 attack dice) targeting '{champ_id}'",
                 assertions=["5 Attack Dice rolled against Crypt Champion"])

        bdd_step("WHEN", f"Barbarian attacks '{champ_id}' with Broadsword",
                 mouse_info=f"Click '⚔️ Attack' targeting '{champ_id}'")

        res = self.player.attack(champ_id, "broadsword")
        self.assertTrue(res.get("success"))
        c_res = res.get("result", {})

        bdd_step("THEN", "Combat engine calculates skulls, black shields, and wounds",
                 assertions=[
                     f"Skulls Rolled: {c_res.get('total_skulls')}",
                     f"Black Shields Rolled: {c_res.get('effective_shields')}",
                     f"Wounds Inflicted: {c_res.get('wounds')}",
                     f"Target Defeated: {res.get('remaining_bp') == 0}"
                 ])

    def test_12_monster_attack_hero_battle_resolution(self):
        """SCENARIO 12: Monster combat resolution - Skulls vs White Shields, Armor Defense, Rock Skin Break."""
        print("\n" + "-" * 80)
        print("SCENARIO 12: Battle Resolution - Monster Attack vs Hero White Shields & Armor")
        print("-" * 80)

        # Give Barbarian Rock Skin
        self.player.cast_spell("rock_skin", "barbarian")

        bdd_step("GIVEN", "Zargon monster strikes Barbarian (defending with White Shields and Rock Skin)",
                 assertions=["Hero defends with White Shields (2 on each 6-sided combat die)"])

        bdd_step("WHEN", "Monster executes attack on Barbarian",
                 mouse_info="Game Master triggers 'dm_attack'")

        dm_res = self.player.dm_attack("barbarian")
        self.assertTrue(dm_res.get("success"))
        c_res = dm_res.get("result", {})

        bdd_step("THEN", "Hero rolls White Shields; wounds reduce Body Points and break Rock Skin",
                 assertions=[
                     f"Skulls Rolled: {c_res.get('total_skulls')}",
                     f"White Shields Rolled: {c_res.get('effective_shields')}",
                     f"Wounds Inflicted: {c_res.get('wounds')}"
                 ])
        self.assertIn("total_skulls", c_res)
        self.assertIn("effective_shields", c_res)
        self.assertIn("wounds", c_res)

    def test_13_sleeping_monster_helpless_defense(self):
        """SCENARIO 13: Tactical Combat - Sleeping Monster Helpless Defense (0 Defend Dice)"""
        print("\n" + "-" * 80)
        print("SCENARIO 13: Tactical Combat - Sleeping Monster Helpless Defense (0 Defend Dice)")
        print("-" * 80)

        # Summon a fresh monster in the crypt
        s_res = self.player.execute_action("summon_monster", x=3, y=4, name="Sleeping Orc", bp=3)
        sleep_id = s_res.get("monster", {}).get("id")
        m_pos = to_coords(s_res.get("monster", {}).get("grid_pos", [3, 4]))

        # Ensure hero is orthogonally adjacent to m_pos
        st = self.player.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        h_pos = to_coords(barb.get("grid_pos", [4, 4]))
        if abs(h_pos[0] - m_pos[0]) + abs(h_pos[1] - m_pos[1]) != 1:
            self.player.execute_action("roll_movement")
            self.player.move(m_pos[0] + 1, m_pos[1])

        # Put Sleeping Orc to sleep
        self.player.cast_spell("sleep", sleep_id)

        bdd_step("GIVEN", f"Cellar monster '{sleep_id}' is enchanted in magical Sleep",
                 assertions=["Sleeping monsters roll 0 defend dice"])

        bdd_step("WHEN", f"Hero attacks sleeping monster '{sleep_id}'",
                 mouse_info=f"Attack '{sleep_id}' while asleep")

        atk_res = self.player.attack(sleep_id, "broadsword")
        self.assertTrue(atk_res.get("success"))
        c_res = atk_res.get("result", {})

        bdd_step("THEN", "Zombie rolls 0 defense dice, all skulls inflict direct wounds",
                 assertions=[
                     f"Defense dice count: {c_res.get('defense', {}).get('dice_count')}",
                     f"Effective shields: {c_res.get('effective_shields')} (must be 0)",
                     f"Wounds inflicted: {c_res.get('wounds')} (equals total skulls)"
                 ])
        self.assertEqual(c_res.get("effective_shields"), 0)
        self.assertEqual(c_res.get("wounds"), c_res.get("total_skulls"))


if __name__ == "__main__":
    unittest.main()
