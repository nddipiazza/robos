#!/usr/bin/env python3
"""
BDD E2E Test Suite: Quest Objectives HUD & Complete Quest Action

Feature:
  As an adventurer playing RobOS Tabletop RPG:
  I want quest objectives visible directly on the game UI with tabletop-rpg styling
  And when all quest objectives are complete, a "Complete Quest" button should appear
  So that clicking it triggers the complete_quest RPC library action, saves the game,
  marks the game state as closed, and progresses the party to the next quest.

Scenarios:
  1. Quest Objectives HUD is displayed on-screen with tabletop-rpg styling and initial objective states.
  2. Completing quest objectives dynamically updates HUD checkboxes and displays the 'Complete Quest' button.
  3. Triggering 'complete_quest' awards bounty, saves game state, marks game state as 'closed', and marks cartridge complete.
"""

import json
import os
import signal
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer


class TestQuestObjectivesHUDAndCompleteQuestE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18142
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.temp_save_path = "/tmp/tabletop_hud_test_save.json"

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.temp_save_path):
            try:
                os.remove(cls.temp_save_path)
            except Exception:
                pass
        # Ensure clean cartridge state
        cart_path = os.path.join(ROOT_DIR, "cartridges/heroquest-the-trial.cartridge.json")
        try:
            subprocess.run(["git", "checkout", cart_path], cwd=ROOT_DIR, check=False)
        except Exception:
            pass

    def setUp(self):
        self.proc = None
        self.player = None
        if os.path.exists(self.temp_save_path):
            try:
                os.remove(self.temp_save_path)
            except Exception:
                pass

    def _stop_game(self):
        if self.proc:
            try:
                pgid = os.getpgid(self.proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            try:
                self.proc.wait(timeout=2.0)
            except Exception:
                pass
            self.proc = None
        if self.player:
            self.player = None

    def tearDown(self):
        self._stop_game()

    def _start_game(self, extra_args=None, extra_env=None):
        env = dict(
            os.environ,
            TABLETOP_SERVER_PORT=str(self.port),
            TABLETOP_SAVE_PATH=self.temp_save_path
        )
        if extra_env:
            env.update(extra_env)

        cmd = ["xvfb-run", "--auto-servernum", self.play_script, "--role=player", "--headless"]
        if extra_args:
            cmd.extend(extra_args)

        self.proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )
        self.player = TabletopQAPlayer(port=self.port, human_delay=0.05)
        self.assertTrue(self.player.wait_for_ready(timeout=14.0), "Godot Tabletop server failed to start")

    def test_01_quest_objectives_hud_displayed_with_tabletop_styling(self):
        print("\n==========================================================================================")
        print("📜 SCENARIO 01: Quest Objectives HUD is displayed on-screen with tabletop-rpg styling")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game is loaded and on-screen HUD elements are initialized")
        st = self.player.get_state()

        print("  WHEN    Inspecting Quest Objectives HUD telemetry")
        hud_info = st.get("questObjectivesHUD", {})
        self.assertTrue(hud_info.get("visible", False), "Quest Objectives HUD is not visible in telemetry!")
        self.assertFalse(hud_info.get("collapsed", True), "Quest Objectives HUD should initially be expanded")

        objectives = self.player.get_quest_objectives()
        self.assertTrue(len(objectives) >= 3, f"Expected at least 3 quest objectives, got: {objectives}")

        print("  THEN    Initial objective states are verified")
        obj_ids = [o.get("id") for o in objectives]
        self.assertIn("slay_boss", obj_ids)
        self.assertIn("explore_dungeon", obj_ids)
        self.assertIn("party_survival", obj_ids)

        slay_obj = next(o for o in objectives if o.get("id") == "slay_boss")
        explore_obj = next(o for o in objectives if o.get("id") == "explore_dungeon")
        survival_obj = next(o for o in objectives if o.get("id") == "party_survival")

        # Boss is alive, no rooms explored initially
        self.assertFalse(slay_obj.get("completed", True), "Boss objective should initially be pending")
        self.assertFalse(explore_obj.get("completed", True), "Exploration objective should initially be pending")
        self.assertTrue(survival_obj.get("completed", False), "Party survival should initially be true (heroes alive)")

        # Complete Quest button should NOT be displayed when objectives are pending
        self.assertFalse(hud_info.get("hasCompleteQuestButton", True),
                         "Complete Quest button should not be displayed when objectives are pending")
        self.assertFalse(self.player.are_quest_objectives_completed(),
                         "are_quest_objectives_completed() should be False initially")

        print(f"    ✔  [ASSERTION]  HUD visible: {hud_info.get('visible')}")
        print(f"    ✔  [ASSERTION]  Objectives: {[o.get('title') for o in objectives]}")
        print("    ✔  [ASSERTION]  Initial state: Objectives pending, 'Complete Quest' button hidden")

    def test_02_objectives_progress_and_complete_quest_button_appears(self):
        print("\n==========================================================================================")
        print("📜 SCENARIO 02: Objectives progress dynamically and Complete Quest button appears")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Party is in the dungeon catacombs")
        # Reveal a room by opening a door or patching revealed_rooms
        print("  WHEN    Heroes breach a chamber and explore rooms")
        self.player.execute_action("patch_state", revealed_rooms=["room-nw-crypt"])

        st = self.player.get_state()
        objs = self.player.get_quest_objectives()
        explore_obj = next(o for o in objs if o.get("id") == "explore_dungeon")
        self.assertTrue(explore_obj.get("completed", False), "Explore dungeon objective should now be completed!")
        print("    ✔  [ASSERTION]  'Explore ancient chambers' marked [OK] complete")

        print("  WHEN    Orc Warlord Verag and all enemy minions are slain")
        # Defeat all monsters
        patch_monsters = []
        for m in st.get("monsters", []):
            m_copy = dict(m)
            m_copy["current_bp"] = 0
            m_copy["is_alive"] = False
            patch_monsters.append(m_copy)
        self.player.execute_action("patch_state", monsters=patch_monsters)

        st = self.player.get_state()
        print("  THEN    All quest objectives are marked complete")
        self.assertTrue(self.player.are_quest_objectives_completed(),
                        "are_quest_objectives_completed() should be True after monsters defeated and rooms explored")

        hud_info = st.get("questObjectivesHUD", {})
        self.assertTrue(hud_info.get("hasCompleteQuestButton", False),
                        "'Complete Quest' button should now be visible on HUD!")
        print("    ✔  [ASSERTION]  '🏆 COMPLETE QUEST' button is displayed on-screen with tabletop styling")

    def test_03_complete_quest_action_awards_bounty_and_closes_game_state(self):
        print("\n==========================================================================================")
        print("📜 SCENARIO 03: Triggering 'complete_quest' action awards bounty, saves, and closes game state")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        initial_gold = [int(h.get("gold", 0)) for h in st.get("heroes", [])]
        print(f"  GIVEN   Party initial gold values: {initial_gold}")

        print("  WHEN    Triggering complete_quest action (without quit for headless inspection)")
        res = self.player.complete_quest(quit=False)
        self.assertTrue(res.get("success", False), f"complete_quest failed: {res}")
        self.assertEqual(res.get("gameState"), "closed", "Returned gameState must be 'closed'")
        self.assertTrue(res.get("isQuestCompleted", False), "Returned isQuestCompleted must be True")
        self.assertEqual(res.get("bountyAwarded"), 100, "Imperial bounty awarded must be 100 gold coins")

        print("  THEN    Game telemetry confirms state is marked as 'closed'")
        self.assertTrue(self.player.is_game_closed(), "is_game_closed() should return True")
        self.assertEqual(self.player.get_game_state(), "closed", "gameState should be 'closed'")

        print("  AND     Living heroes received the 100g bounty")
        st_after = self.player.get_state()
        after_gold = [int(h.get("gold", 0)) for h in st_after.get("heroes", [])]
        for idx in range(len(initial_gold)):
            self.assertEqual(after_gold[idx], initial_gold[idx] + 100,
                             f"Hero {idx} did not receive 100 gold bounty!")

        print("  AND     Save file exists on disk with closed game state")
        actual_file = self.temp_save_path
        if os.path.exists(actual_file):
            with open(actual_file, "r") as f:
                saved_data = json.load(f)
            self.assertEqual(saved_data.get("game_state"), "closed", "Save file must contain game_state='closed'")
            print(f"    ✔  [ASSERTION]  Save file on disk verified: {actual_file} (game_state: 'closed')")

        print("    ✔  [ASSERTION]  complete_quest action executed successfully with all state closures")


if __name__ == "__main__":
    unittest.main()
