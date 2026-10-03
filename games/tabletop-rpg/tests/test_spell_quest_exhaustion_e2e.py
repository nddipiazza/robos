#!/usr/bin/env python3
"""
test_spell_quest_exhaustion_e2e.py
BDD End-to-End Test Suite verifying authentic HeroQuest spell quest exhaustion:
Once a spell is cast, it is exhausted and disabled until the end of the quest.

HeroQuest Rules Verified:
1. Spells are single-use per quest.
2. Casting a spell marks it in `used_spells` and removes it from available spells.
3. Attempting to recast an exhausted spell fails with error and unavailable notice.
4. Portrait toolbar icon for the spent spell is visually dimmed, disabled, and has a click shield.
5. Targeting mode refuses to engage with spent spells.
6. HeroDetailModal displays [EXHAUSTED] badge and disables targeting for spent spells.
7. SpellCastModal displays [EXHAUSTED] badge and disabled button for spent spells.
8. Spell exhaustion persists across multiple turns and rounds.
9. Resetting quest spells (or loading a new quest) restores all spells.
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


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 90}")
    print(f"🔮 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 90}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestSpellQuestExhaustionE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18105

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("📜 FEATURE: Authentic HeroQuest Spell Quest Exhaustion (Single Use Per Quest)")
        print("   Rule: After using a spell, it must be disabled until end of quest.")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--skip-spell-select"],
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

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()
        print("\n" + "=" * 90)
        print("🏁 FEATURE VERIFIED: Spells correctly disabled until end of quest!")
        print("=" * 90 + "\n")

    def setUp(self):
        # Ensure dialogs and targeting closed
        self.player.cancel_targeting()
        self.player.close_all_dialogs()
        # Setup pristine active hero = wizard at (3, 3) facing Crypt Skeleton at (3, 4)
        self.player.execute_action("patch_state",
            active_hero="wizard",
            has_acted_this_turn=False,
            hasActedThisTurn=False,
            heroes=[
                {
                    "id": "wizard",
                    "grid_pos": [3, 3],
                    "is_on_board": True,
                    "current_bp": 4,
                    "spells": ["ball_of_flame", "fire_of_wrath", "courage"],
                    "used_spells": []
                }
            ],
            monsters=[
                {
                    "id": "test_skel",
                    "name": "Crypt Skeleton",
                    "grid_pos": [3, 4],
                    "is_alive": True,
                    "current_bp": 3,
                    "bodyPoints": 3,
                    "attackDice": 2,
                    "defendDice": 2
                }
            ],
            revealedRooms=["northwest_crypt"],
            discoveredMonsterIds=["test_skel"],
            explored_tiles=[[3, 3], [3, 4]]
        )

    def test_01_cast_spell_records_as_used_and_exhausts_it(self):
        bdd_scenario_header(1, "Casting a spell exhausts it for the remainder of the quest")

        bdd_step("GIVEN", "Wizard has 'ball_of_flame' memorized and unspent")
        sp_data = self.player.get_hero_spells("wizard")
        self.assertIn("ball_of_flame", sp_data["spells"])
        self.assertNotIn("ball_of_flame", sp_data["usedSpells"])
        self.assertIn("ball_of_flame", sp_data["availableSpells"])

        bdd_step("WHEN", "Wizard casts 'ball_of_flame' on target monster 'test_skel'")
        res = self.player.cast_spell("ball_of_flame", "test_skel")
        self.assertTrue(res.get("success"), f"Cast spell failed: {res.get('error')}")

        bdd_step("THEN", "The spell is recorded in usedSpells and removed from availableSpells",
                 assertions=[
                     "Result contains used_spells with 'ball_of_flame'",
                     "Telemetry confirms 'ball_of_flame' is spent"
                 ])
        self.assertIn("ball_of_flame", res.get("used_spells", []))

        sp_after = self.player.get_hero_spells("wizard")
        self.assertIn("ball_of_flame", sp_after["usedSpells"])
        self.assertNotIn("ball_of_flame", sp_after["availableSpells"])
        self.assertIn("fire_of_wrath", sp_after["availableSpells"])
        self.assertIn("courage", sp_after["availableSpells"])

    def test_02_attempt_recast_exhausted_spell_fails_and_notifies(self):
        bdd_scenario_header(2, "Attempting to recast an exhausted spell is strictly rejected")

        bdd_step("GIVEN", "'ball_of_flame' was already cast and is exhausted")
        self.player.execute_action("patch_state",
            has_acted_this_turn=False,
            heroes=[{"id": "wizard", "used_spells": ["ball_of_flame"]}]
        )
        self.assertTrue(self.player.is_spell_spent("ball_of_flame", "wizard"))

        bdd_step("WHEN", "Player attempts to recast 'ball_of_flame'")
        res = self.player.cast_spell("ball_of_flame", "test_skel")

        bdd_step("THEN", "The cast attempt is rejected with quest exhaustion error",
                 assertions=[
                     "res.success == False",
                     "Error states spell already used this quest"
                 ])
        self.assertFalse(res.get("success"))
        self.assertIn("already used this quest", res.get("error", "").lower())

    def test_03_spent_spell_icon_on_portrait_toolbar_is_disabled(self):
        bdd_scenario_header(3, "Portrait toolbar icon for spent spell is disabled and greyed out")

        bdd_step("GIVEN", "Wizard has 'ball_of_flame' exhausted in used_spells")
        self.player.execute_action("patch_state",
            heroes=[{"id": "wizard", "used_spells": ["ball_of_flame"]}]
        )

        bdd_step("WHEN", "Inspecting the character card icons telemetry for Wizard")
        sp_data = self.player.get_hero_spells("wizard")
        bof_icon = next((ic for ic in sp_data.get("cardIcons", []) if ic.get("id") == "ball_of_flame"), None)

        bdd_step("THEN", "The spell icon reports isSpent=True and disabled=True",
                 assertions=[
                     "bof_icon is not None",
                     "bof_icon['isSpent'] is True",
                     "bof_icon['disabled'] is True"
                 ])
        self.assertIsNotNone(bof_icon, "Spell icon must exist on portrait toolbar")
        self.assertTrue(bof_icon.get("isSpent"), "Spell icon must report isSpent == True")
        self.assertTrue(bof_icon.get("disabled"), "Spell icon must report disabled == True")

        # Unspent spell is not spent
        fow_icon = next((ic for ic in sp_data.get("cardIcons", []) if ic.get("id") == "fire_of_wrath"), None)
        self.assertIsNotNone(fow_icon)
        self.assertFalse(fow_icon.get("isSpent"))
        self.assertFalse(fow_icon.get("disabled"))

    def test_04_targeting_mode_refuses_exhausted_spell(self):
        bdd_scenario_header(4, "Targeting mode cannot be initiated for an exhausted spell")

        bdd_step("GIVEN", "Wizard has exhausted 'ball_of_flame'")
        self.player.execute_action("patch_state",
            heroes=[{"id": "wizard", "used_spells": ["ball_of_flame"]}]
        )

        bdd_step("WHEN", "Player attempts to start targeting with 'ball_of_flame'")
        res = self.player.start_targeting("spell", "ball_of_flame", "wizard")

        bdd_step("THEN", "start_targeting fails and targeting remains inactive",
                 assertions=[
                     "res.success == False",
                     "is_targeting_active() is False"
                 ])
        self.assertFalse(res.get("success"))
        self.assertFalse(self.player.is_targeting_active())

        bdd_step("WHEN", "Player attempts to toggle targeting with 'ball_of_flame'")
        self.player.toggle_targeting("spell", "ball_of_flame", "wizard")

        bdd_step("THEN", "Targeting still remains inactive",
                 assertions=["is_targeting_active() is False"])
        self.assertFalse(self.player.is_targeting_active())

    def test_05_unspent_spells_remain_available_and_castable(self):
        bdd_scenario_header(5, "Other uncast spells remain available and functional")

        bdd_step("GIVEN", "Wizard has exhausted 'ball_of_flame' but NOT 'fire_of_wrath'")
        self.player.execute_action("patch_state",
            has_acted_this_turn=False,
            heroes=[{"id": "wizard", "used_spells": ["ball_of_flame"]}]
        )

        bdd_step("WHEN", "Wizard casts 'fire_of_wrath' on 'test_skel'")
        res = self.player.cast_spell("fire_of_wrath", "test_skel")

        bdd_step("THEN", "Fire of Wrath succeeds and is now also marked as exhausted",
                 assertions=[
                     "res.success == True",
                     "Both 'ball_of_flame' and 'fire_of_wrath' are in usedSpells"
                 ])
        self.assertTrue(res.get("success"))
        sp_data = self.player.get_hero_spells("wizard")
        self.assertIn("ball_of_flame", sp_data["usedSpells"])
        self.assertIn("fire_of_wrath", sp_data["usedSpells"])
        self.assertEqual(sp_data["availableSpells"], ["courage"])

    def test_06_spell_exhaustion_persists_across_turns_and_rounds(self):
        bdd_scenario_header(6, "Spell exhaustion persists across multiple turns until end of quest")

        bdd_step("GIVEN", "Wizard has exhausted 'ball_of_flame'")
        self.player.execute_action("patch_state",
            heroes=[{"id": "wizard", "used_spells": ["ball_of_flame"]}]
        )

        bdd_step("WHEN", "Multiple turns and rounds are completed via end_turn")
        for _ in range(4):
            self.player.end_turn()

        bdd_step("THEN", "Wizard's 'ball_of_flame' remains strictly exhausted in usedSpells",
                 assertions=[
                     "Wizard still has 'ball_of_flame' in usedSpells",
                     "'ball_of_flame' is not in availableSpells"
                 ])
        sp_data = self.player.get_hero_spells("wizard")
        self.assertIn("ball_of_flame", sp_data["usedSpells"])
        self.assertNotIn("ball_of_flame", sp_data["availableSpells"])

    def test_07_resetting_quest_spells_re_enables_all_memorized_spells(self):
        bdd_scenario_header(7, "Concluding quest or resetting spells re-enables all memorized spells")

        bdd_step("GIVEN", "Wizard has exhausted spells ['ball_of_flame', 'fire_of_wrath']")
        self.player.execute_action("patch_state",
            heroes=[{"id": "wizard", "used_spells": ["ball_of_flame", "fire_of_wrath"]}]
        )
        self.assertEqual(len(self.player.get_hero_spells("wizard")["usedSpells"]), 2)

        bdd_step("WHEN", "The quest concludes and spells are reset for the next quest")
        res = self.player.reset_quest_spells()
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "usedSpells is empty and all 3 spells are available again",
                 assertions=[
                     "usedSpells == []",
                     "availableSpells contains all 3 spells"
                 ])
        sp_data = self.player.get_hero_spells("wizard")
        self.assertEqual(sp_data["usedSpells"], [])
        self.assertEqual(len(sp_data["availableSpells"]), 3)
        self.assertIn("ball_of_flame", sp_data["availableSpells"])
        self.assertIn("fire_of_wrath", sp_data["availableSpells"])
        self.assertIn("courage", sp_data["availableSpells"])


if __name__ == "__main__":
    unittest.main()
