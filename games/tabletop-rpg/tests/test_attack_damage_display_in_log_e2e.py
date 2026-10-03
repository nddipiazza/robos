#!/usr/bin/env python3
"""
test_attack_damage_display_in_log_e2e.py

Verifies that when a player hero is hit by an attack:
1. The huge text area (UI/LogPanel/LogLabel) prominently displays what character(s) lost what from the turn.
2. The latest attack hit that just happened is highlighted with attacker, defender, roll results, wounds, and BP change.
3. Turn losses across characters accumulate properly (wounds lost, remaining BP, health bar).
4. Broken buffs (such as Rock Skin shattered) are prominently called out in the huge text area.
5. Hero defeat is clearly highlighted.
6. Blocked attacks do not falsely claim damage lost.
7. The user can toggle between the Turn Damage Report and the full Combat Log history.
"""

import os
import sys
import time
import unittest
import subprocess

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, action_info: str = None, assertions: list = None):
    type_badge = {
        "GIVEN": "  GIVEN  ",
        "WHEN":  "  WHEN   ",
        "THEN":  "  THEN   ",
        "AND":   "  AND    "
    }.get(step_type, f"  {step_type} ")
    print(f"\n{type_badge} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]       {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestAttackDamageDisplayInLogE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚔️ FEATURE: Prominent Turn Damage & Character Loss Display in Log Panel")
        print("   As a HeroQuest tabletop player")
        print("   When a player character is hit by an attack that just happened")
        print("   I want the huge log text area to prominently display what character(s) lost what from the turn")
        print("   So that I have clear, unambiguous visibility into damage, shattered buffs, and party status")
        print("=" * 90)

        cls.play_script = os.path.join(PROJECT_ROOT, "play.sh")
        cls.port = 18107
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(2.5)

        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.1)
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
        time.sleep(0.15)

    def test_01_single_hero_attack_hit_displays_damage_and_bp_loss(self):
        """Scenario 01: Enemy attacks Barbarian; huge text area displays strike, wounds, and BP remaining."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Single Hero Attack Hit Displays Damage & BP Loss in Log Panel")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian has 8 Body Points and Orc attacker is positioned adjacent at (2, 2)")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "barbarian", "name": "Barbarian", "characterName": "Rogar", "heroClass": "Barbarian", "current_bp": 8, "bodyPoints": 8, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[{"id": "mon-orc", "name": "Orc Warrior", "attackDice": 4, "current_bp": 3, "bodyPoints": 3, "grid_pos": [2, 2], "is_alive": True}],
            resetTurnLosses=True
        )

        bdd_step("WHEN", "Orc attacks Barbarian with dm_attack inflicting wounds",
                 action_info="dm_attack(hero_id='barbarian', monster_id='mon-orc')")
        res = self.player.dm_attack(hero_id="barbarian", monster_id="mon-orc")
        st = self.player.get_state()

        summary = st.get("turnDamageSummary", {})
        last_hit = summary.get("lastAttackHit", {})
        char_losses = summary.get("characterLosses", {})
        displayed_text = st.get("displayedLogText", "")
        parsed_text = st.get("parsedLogText", "")

        bdd_step("THEN", "Turn damage summary activates and displays attack hit and BP losses in huge text area",
                 assertions=[
                     f"Damage summary active: {summary.get('active')} (expected True)",
                     f"Last attack target: '{last_hit.get('target_name')}'",
                     f"Wounds inflicted: {last_hit.get('wounds_inflicted')} (expected > 0)",
                     f"Remaining BP: {last_hit.get('current_bp')} / {last_hit.get('max_bp')}",
                     f"Character losses contains Barbarian: {'barbarian' in char_losses}",
                     f"Displayed text contains 'ATTACK DAMAGE REPORT': {'ATTACK DAMAGE REPORT' in displayed_text}",
                     f"Displayed text contains 'LATEST ATTACK HIT': {'LATEST ATTACK HIT' in displayed_text}",
                     f"Displayed text contains 'CHARACTER LOSSES THIS TURN': {'CHARACTER LOSSES THIS TURN' in displayed_text}",
                     f"Displayed text contains 'Barbarian': {'Barbarian' in displayed_text}"
                 ])

        self.assertTrue(summary.get("active"))
        self.assertEqual(last_hit.get("target_name"), "Barbarian")
        self.assertGreater(last_hit.get("wounds_inflicted", 0), 0)
        self.assertEqual(last_hit.get("prev_bp"), 8)
        self.assertEqual(last_hit.get("current_bp"), 8 - last_hit.get("wounds_inflicted"))
        self.assertIn("barbarian", char_losses)
        self.assertIn("ATTACK DAMAGE REPORT", displayed_text)
        self.assertIn("LATEST ATTACK HIT", displayed_text)
        self.assertIn("CHARACTER LOSSES THIS TURN", displayed_text)
        self.assertIn("Barbarian", displayed_text)
        self.assertIn("Body Point", displayed_text)

    def test_02_spell_buff_loss_displayed_when_rock_skin_shattered(self):
        """Scenario 02: Enemy attacks Dwarf with Rock Skin; huge text area highlights shattered buff."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Spell Buff Loss (Rock Skin Shattered) Displayed in Log Panel")
        print("-" * 80)

        bdd_step("GIVEN", "Dwarf has 7 BP and active Rock Skin spell")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "dwarf", "name": "Dwarf", "characterName": "Dorgan", "heroClass": "Dwarf", "current_bp": 7, "bodyPoints": 7, "rock_skin_active": True, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[{"id": "mon-fimir", "name": "Fimir", "attackDice": 6, "current_bp": 4, "bodyPoints": 4, "grid_pos": [2, 2], "is_alive": True}],
            resetTurnLosses=True
        )

        bdd_step("WHEN", "Fimir attacks Dwarf inflicting wounds and shattering Rock Skin",
                 action_info="dm_attack(hero_id='dwarf', monster_id='mon-fimir')")
        self.player.dm_attack(hero_id="dwarf", monster_id="mon-fimir")
        st = self.player.get_state()

        summary = st.get("turnDamageSummary", {})
        last_hit = summary.get("lastAttackHit", {})
        dwarf_loss = summary.get("characterLosses", {}).get("dwarf", {})
        displayed_text = st.get("displayedLogText", "")

        bdd_step("THEN", "Huge text area clearly reports that Rock Skin was shattered by the blow",
                 assertions=[
                     f"Last hit rock_skin_shattered: {last_hit.get('rock_skin_shattered')} (expected True)",
                     f"Dwarf loss rock_skin_shattered: {dwarf_loss.get('rock_skin_shattered')} (expected True)",
                     f"Displayed text contains '[BUFF LOST] Rock Skin was shattered': {'BUFF LOST' in displayed_text and 'Rock Skin' in displayed_text}"
                 ])

        self.assertTrue(last_hit.get("rock_skin_shattered"))
        self.assertTrue(dwarf_loss.get("rock_skin_shattered"))
        self.assertIn("BUFF LOST", displayed_text)
        self.assertIn("Rock Skin", displayed_text)

    def test_03_multiple_heroes_damaged_in_turn_accumulate_losses(self):
        """Scenario 03: Multiple heroes take damage in same turn; huge text area displays breakdown for each."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Multiple Heroes Damaged in Turn Accumulate Losses in Log Panel")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian and Elf both present on board in gm_phase")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "characterName": "Rogar", "heroClass": "Barbarian", "current_bp": 8, "bodyPoints": 8, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True},
                {"id": "elf", "name": "Elf", "characterName": "Tylion", "heroClass": "Elf", "current_bp": 6, "bodyPoints": 6, "defendDice": 0, "grid_pos": [3, 1], "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-orc-1", "name": "Orc Raider", "attackDice": 3, "current_bp": 2, "bodyPoints": 2, "grid_pos": [2, 2], "is_alive": True},
                {"id": "mon-orc-2", "name": "Orc Hunter", "attackDice": 3, "current_bp": 2, "bodyPoints": 2, "grid_pos": [3, 2], "is_alive": True}
            ],
            resetTurnLosses=True
        )

        bdd_step("WHEN", "First monster strikes Barbarian and second monster strikes Elf",
                 action_info="dm_attack('barbarian'), then dm_attack('elf')")
        self.player.dm_attack(hero_id="barbarian", monster_id="mon-orc-1")
        self.player.dm_attack(hero_id="elf", monster_id="mon-orc-2")
        st = self.player.get_state()

        summary = st.get("turnDamageSummary", {})
        char_losses = summary.get("characterLosses", {})
        displayed_text = st.get("displayedLogText", "")

        bdd_step("THEN", "Huge text area lists both Barbarian and Elf with their turn losses and total party loss",
                 assertions=[
                     f"Damaged characters count: {summary.get('damagedCharactersCount')} (expected 2)",
                     f"Total party wounds lost: {summary.get('totalPartyWoundsLost')} (expected > 0)",
                     f"Barbarian listed: {'barbarian' in char_losses}",
                     f"Elf listed: {'elf' in char_losses}",
                     f"Displayed text contains 'Barbarian': {'Barbarian' in displayed_text}",
                     f"Displayed text contains 'Elf': {'Elf' in displayed_text}",
                     f"Displayed text contains 'Turn Total': {'Turn Total' in displayed_text}"
                 ])

        self.assertEqual(summary.get("damagedCharactersCount"), 2)
        self.assertIn("barbarian", char_losses)
        self.assertIn("elf", char_losses)
        self.assertIn("Barbarian", displayed_text)
        self.assertIn("Elf", displayed_text)
        self.assertIn("Turn Total", displayed_text)
        self.assertIn("2 Hero(es)", displayed_text)

    def test_04_multiple_attacks_on_same_hero_accumulate_turn_wounds(self):
        """Scenario 04: Same hero attacked twice in one turn; turn losses accumulates cumulative damage."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Multiple Attacks on Same Hero Accumulate Turn Wounds")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian starts with 8 Body Points")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "barbarian", "name": "Barbarian", "characterName": "Rogar", "heroClass": "Barbarian", "current_bp": 8, "bodyPoints": 8, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[
                {"id": "mon-goblin-1", "name": "Goblin 1", "attackDice": 6, "current_bp": 1, "bodyPoints": 1, "grid_pos": [2, 2], "is_alive": True},
                {"id": "mon-goblin-2", "name": "Goblin 2", "attackDice": 6, "current_bp": 1, "bodyPoints": 1, "grid_pos": [1, 1], "is_alive": True}
            ],
            resetTurnLosses=True
        )

        bdd_step("WHEN", "Goblin 1 attacks Barbarian, then Goblin 2 attacks Barbarian",
                 action_info="dm_attack('barbarian', 'mon-goblin-1') then dm_attack('barbarian', 'mon-goblin-2')")
        self.player.dm_attack(hero_id="barbarian", monster_id="mon-goblin-1")
        st1 = self.player.get_state()
        w1 = st1.get("turnDamageSummary", {}).get("characterLosses", {}).get("barbarian", {}).get("wounds_lost", 0)

        self.player.dm_attack(hero_id="barbarian", monster_id="mon-goblin-2")
        st2 = self.player.get_state()
        barb_loss = st2.get("turnDamageSummary", {}).get("characterLosses", {}).get("barbarian", {})
        displayed_text = st2.get("displayedLogText", "")

        bdd_step("THEN", "Barbarian's turn losses reflect the combined damage and hit count of 2",
                 assertions=[
                     f"First attack wounds: {w1}",
                     f"Total accumulated wounds: {barb_loss.get('wounds_lost')} (expected >= {w1})",
                     f"Hit count: {barb_loss.get('hit_count')} (expected 2)",
                     f"Displayed text contains 'Hit 2x': {'Hit 2x' in displayed_text}"
                 ])

        self.assertEqual(barb_loss.get("hit_count"), 2)
        self.assertGreaterEqual(barb_loss.get("wounds_lost", 0), w1)
        self.assertIn("Hit 2x", displayed_text)

    def test_05_blocked_attack_does_not_claim_damage_lost(self):
        """Scenario 05: Blocked attack (0 wounds) logs blocked and does not claim damage lost."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Blocked Attack Does Not Claim Damage Lost")
        print("-" * 80)

        bdd_step("GIVEN", "Dwarf has 10 defend dice against an attacker with 1 attack dice")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "dwarf", "name": "Dwarf", "current_bp": 7, "bodyPoints": 7, "defendDice": 10, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[{"id": "mon-weak", "name": "Weak Skeleton", "attackDice": 1, "current_bp": 1, "bodyPoints": 1, "grid_pos": [2, 2], "is_alive": True}],
            resetTurnLosses=True
        )

        bdd_step("WHEN", "Weak Skeleton attacks Dwarf and is completely blocked",
                 action_info="dm_attack(hero_id='dwarf', monster_id='mon-weak')")
        self.player.dm_attack(hero_id="dwarf", monster_id="mon-weak")
        st = self.player.get_state()

        c_log = st.get("combatLog", [])
        has_blocked = any("[BLOCKED]" in entry for entry in c_log)
        summary = st.get("turnDamageSummary", {})
        char_losses = summary.get("characterLosses", {})

        bdd_step("THEN", "Attack is recorded as BLOCKED and no turn damage losses are recorded",
                 assertions=[
                     f"Combat log contains [BLOCKED]: {has_blocked} (expected True)",
                     f"Character losses contains Dwarf: {'dwarf' in char_losses} (expected False)",
                     f"Damage summary active: {summary.get('active')} (expected False)"
                 ])

        self.assertTrue(has_blocked)
        self.assertNotIn("dwarf", char_losses)
        self.assertFalse(summary.get("active", False))

    def test_06_hero_defeat_prominently_highlighted(self):
        """Scenario 06: Hero suffers fatal damage; huge text area prominently highlights [DEFEATED]."""
        print("\n" + "-" * 80)
        print("SCENARIO 06: Hero Defeat Prominently Highlighted in Log Panel")
        print("-" * 80)

        bdd_step("GIVEN", "Wizard has only 1 Body Point remaining")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "wizard", "name": "Wizard", "characterName": "Solas", "heroClass": "Wizard", "current_bp": 1, "bodyPoints": 4, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[{"id": "mon-boss", "name": "Gargoyle", "attackDice": 6, "current_bp": 3, "bodyPoints": 3, "grid_pos": [2, 2], "is_alive": True}],
            resetTurnLosses=True
        )

        bdd_step("WHEN", "Gargoyle strikes Wizard with lethal attack",
                 action_info="dm_attack('wizard', 'mon-boss')")
        self.player.dm_attack(hero_id="wizard", monster_id="mon-boss")
        st = self.player.get_state()

        summary = st.get("turnDamageSummary", {})
        last_hit = summary.get("lastAttackHit", {})
        wiz_loss = summary.get("characterLosses", {}).get("wizard", {})
        displayed_text = st.get("displayedLogText", "")

        bdd_step("THEN", "Wizard's defeat is prominently displayed with [DEFEATED] status in log area",
                 assertions=[
                     f"Last hit is_defeated: {last_hit.get('is_defeated')} (expected True)",
                     f"Wizard loss is_defeated: {wiz_loss.get('is_defeated')} (expected True)",
                     f"Wizard remaining BP: {wiz_loss.get('current_bp')} (expected 0)",
                     f"Displayed text contains '[DEFEATED]': {'DEFEATED' in displayed_text}"
                 ])

        self.assertTrue(last_hit.get("is_defeated"))
        self.assertTrue(wiz_loss.get("is_defeated"))
        self.assertEqual(wiz_loss.get("current_bp"), 0)
        self.assertIn("DEFEATED", displayed_text)

    def test_07_toggle_log_view_between_damage_report_and_full_history(self):
        """Scenario 07: User toggles log display mode between damage report and standard combat log."""
        print("\n" + "-" * 80)
        print("SCENARIO 07: Toggle Log View Between Damage Report and Full History")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian was wounded and damage report is active in LogPanel")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "barbarian", "name": "Barbarian", "characterName": "Rogar", "heroClass": "Barbarian", "current_bp": 8, "bodyPoints": 8, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[{"id": "mon-orc", "name": "Orc", "attackDice": 3, "current_bp": 3, "bodyPoints": 3, "grid_pos": [2, 2], "is_alive": True}],
            resetTurnLosses=True
        )
        self.player.dm_attack(hero_id="barbarian", monster_id="mon-orc")
        st_initial = self.player.get_state()
        self.assertEqual(st_initial.get("turnDamageSummary", {}).get("displayMode"), "damage_report")

        bdd_step("WHEN", "User invokes toggle_log_view action",
                 action_info="toggle_log_view()")
        res_toggle = self.player.toggle_log_view()
        st_toggled = self.player.get_state()

        bdd_step("THEN", "Display mode switches to combat_log",
                 assertions=[
                     f"Toggled mode: '{res_toggle.get('mode')}' (expected 'combat_log')",
                     f"Telemetry display mode: '{st_toggled.get('turnDamageSummary', {}).get('displayMode')}'"
                 ])
        self.assertEqual(res_toggle.get("mode"), "combat_log")
        self.assertEqual(st_toggled.get("turnDamageSummary", {}).get("displayMode"), "combat_log")

        bdd_step("WHEN", "User invokes toggle_log_view again",
                 action_info="toggle_log_view()")
        res_back = self.player.toggle_log_view()
        st_back = self.player.get_state()

        bdd_step("THEN", "Display mode switches back to damage_report",
                 assertions=[
                     f"Restored mode: '{res_back.get('mode')}' (expected 'damage_report')",
                     f"Telemetry display mode: '{st_back.get('turnDamageSummary', {}).get('displayMode')}'"
                 ])
        self.assertEqual(res_back.get("mode"), "damage_report")
        self.assertEqual(st_back.get("turnDamageSummary", {}).get("displayMode"), "damage_report")


if __name__ == "__main__":
    unittest.main()
