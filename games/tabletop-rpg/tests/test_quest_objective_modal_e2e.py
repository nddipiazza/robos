#!/usr/bin/env python3
"""
BDD E2E Test Suite: Review Quest Objective Header Button & RPG Themed Dialog

Feature:
  As an adventurer playing RobOS Tabletop RPG:
  I want a "Review Quest Objective" button in the header bar and a themed RPG dialog
  So that I can review Mentor's briefing, victory directives, and imperial bounty at any time.

Scenarios:
  1. The header bar displays the 'BtnReviewQuestObjective' button alongside 'BtnGameMenu'.
  2. Opening the Quest Objective modal displays the quest briefing, directives, and imperial bounty.
  3. Toggling and closing the modal cleanly restores gameplay.
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


class TestQuestObjectiveModalE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18138
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")

    def setUp(self):
        self.proc = None
        self.player = None

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
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(self.port))
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

    def test_01_review_quest_objective_button_in_header(self):
        print("\n==========================================================================================")
        print("📜 SCENARIO 01: 'Review Objective' button is present on the main header bar")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game is loaded and header UI is initialized")
        st = self.player.get_state()

        print("  WHEN    Inspecting header buttons in the scene hierarchy")
        scene_ui = st.get("scene", {}).get("ui", {})
        header_btns = scene_ui.get("headerButtons", [])

        # Verify BtnReviewQuestObjective is present
        self.assertIn("BtnReviewQuestObjective", header_btns,
                      f"BtnReviewQuestObjective was not found in header buttons! Found: {header_btns}")
        self.assertIn("BtnGameMenu", header_btns,
                      f"BtnGameMenu was not found in header buttons! Found: {header_btns}")

        btn_info = scene_ui.get("buttons", {}).get("review_objective", {})
        self.assertEqual(btn_info.get("text"), "Review Objective",
                         f"Expected button text 'Review Objective', got: '{btn_info.get('text')}'")

        print(f"    ✔  [ASSERTION]  Header buttons: {header_btns}")
        print(f"    ✔  [ASSERTION]  Button text: '{btn_info.get('text')}'")
        print("    ✔  [ASSERTION]  'BtnReviewQuestObjective' is present on the main screen header with label 'Review Objective'")

    def test_02_open_inspect_and_close_quest_objective_modal(self):
        print("\n==========================================================================================")
        print("📜 SCENARIO 02: Open, inspect briefing and bounty, and close Quest Objective modal")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Quest Objective modal is initially closed")
        self.assertFalse(self.player.is_quest_objective_open(), "Quest objective modal should initially be closed")

        print("  WHEN    open_quest_objective action is executed")
        res = self.player.open_quest_objective()
        self.assertTrue(res.get("success", False), f"open_quest_objective failed: {res}")

        print("  THEN    Quest Objective modal is open in telemetry")
        self.assertTrue(self.player.is_quest_objective_open(), "Quest objective modal not open in telemetry")

        print("  AND     Telemetry contains active quest briefing, title, and imperial bounty")
        obj = self.player.get_quest_objective()
        self.assertIn("The Trial", obj.get("title", ""), "Quest title does not mention 'The Trial'")
        self.assertIn("Verag", obj.get("briefing", ""), "Mentor's briefing does not mention 'Verag'")
        self.assertEqual(obj.get("goldReward", 0), 100, "Imperial bounty should be 100 gold coins")
        self.assertTrue(len(obj.get("primaryGoals", [])) >= 3, "Should have at least 3 primary quest directives")
        print(f"    ✔  [ASSERTION]  Quest Title: {obj.get('title')}")
        print(f"    ✔  [ASSERTION]  Mentor's Briefing: {obj.get('briefing')}")
        print(f"    ✔  [ASSERTION]  Bounty: {obj.get('goldReward')} Gold Coins")
        print(f"    ✔  [ASSERTION]  Goals: {obj.get('primaryGoals')}")

        print("  WHEN    close_quest_objective action is executed")
        res_close = self.player.close_quest_objective()
        self.assertTrue(res_close.get("success", False), "close_quest_objective failed")

        print("  THEN    Quest Objective modal is closed")
        self.assertFalse(self.player.is_quest_objective_open(), "Quest objective modal was still reported open")

        print("  WHEN    toggle_quest_objective action is executed")
        self.player.toggle_quest_objective()
        self.assertTrue(self.player.is_quest_objective_open(), "toggle_quest_objective failed to reopen modal")

        print("  WHEN    toggle_quest_objective action is executed again")
        self.player.toggle_quest_objective()
        self.assertFalse(self.player.is_quest_objective_open(), "toggle_quest_objective failed to close modal")
        print("    ✔  [ASSERTION]  Toggle open and close cycles verified")


if __name__ == "__main__":
    unittest.main()
