#!/usr/bin/env python3
"""
BDD E2E Test Suite: Restart Quest Confirmation Modal

Feature:
  As an adventurer playing RobOS Tabletop RPG:
  I want a confirmation prompt when I choose to Restart Quest
  So that I do not accidentally lose my progress and saved game.

Scenarios:
  1. Clicking 'Restart Quest' from the Game Menu opens the Restart Confirmation Modal.
  2. Cancelling the restart confirmation preserves the current game progress, round, and save file.
  3. Confirming the restart wipes the saved game, resets the quest to Round 1, and closes all modals.
  4. Quest Complete modal's restart button also routes through the confirmation modal.
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


class TestRestartQuestConfirmModalE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18139
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.temp_save_dir = "/tmp/tabletop_restart_confirm_test_dir"
        os.makedirs(cls.temp_save_dir, exist_ok=True)
        cls.test_save_path = os.path.join(cls.temp_save_dir, "test_restart_save.json")

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
        if os.path.exists(self.test_save_path):
            try:
                os.remove(self.test_save_path)
            except Exception:
                pass

    def _start_game(self, extra_args=None, extra_env=None):
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(self.port), TABLETOP_SAVE_PATH=self.test_save_path)
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

    def test_01_game_menu_restart_opens_confirm_modal_and_cancel_preserves_state(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 01: 'Restart Quest' from Game Menu opens confirmation modal; Cancel preserves state")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Active game at Round 3 with Dwarf at [4, 5] and 5 Body Points")
        self.player.set_state(
            active_hero="dwarf",
            current_round=3,
            heroes=[
                {"id": "dwarf", "name": "Grungi", "grid_pos": [4, 5], "current_bp": 5, "bodyPoints": 7}
            ]
        )
        self.player.save_game_state()
        self.assertTrue(os.path.exists(self.test_save_path), "Save file should exist on disk")

        print("  WHEN    Opening Game Menu")
        self.player.open_game_menu()
        self.assertTrue(self.player.is_game_menu_open(), "Game Menu should be open")
        self.assertFalse(self.player.is_restart_confirm_open(), "Confirmation modal should not yet be open")

        print("  AND     Clicking 'RESTART QUEST'")
        res = self.player.click_menu_restart_quest()
        self.assertTrue(res.get("success", False), "click_menu_restart_quest failed")

        print("  THEN    Restart Confirmation Modal is visible")
        self.assertTrue(self.player.is_restart_confirm_open(), "Restart Confirmation Modal should be open")

        print("  WHEN    Clicking 'CANCEL (KEEP PLAYING)'")
        cancel_res = self.player.cancel_restart_quest()
        self.assertTrue(cancel_res.get("success", False), "cancel_restart_quest failed")

        print("  THEN    Confirmation modal is dismissed")
        self.assertFalse(self.player.is_restart_confirm_open(), "Confirmation modal should be closed")

        print("  AND     Save file on disk is still intact")
        self.assertTrue(os.path.exists(self.test_save_path), "Save file must NOT be deleted upon cancel")

        print("  AND     Current round and hero vitals are untouched")
        current_st = self.player.get_state()
        self.assertEqual(current_st.get("round"), 3, "Round should still be 3")
        dwarf_hero = next(h for h in current_st.get("heroes", []) if h.get("id") == "dwarf")
        self.assertEqual(dwarf_hero.get("grid_pos"), [4, 5], "Dwarf position should remain [4, 5]")
        print("    ✔  [ASSERTION]  Confirmation modal opened and cancel successfully preserved game progress")

    def test_02_confirming_restart_wipes_save_and_reloads_round_1(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 02: Confirming 'Restart Quest' wipes save file and resets to Round 1")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Active game at Round 6 with saved game on disk")
        self.player.set_state(
            active_hero="barbarian",
            current_round=6,
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [8, 8], "current_bp": 3, "bodyPoints": 8}
            ]
        )
        self.player.save_game_state()
        self.assertTrue(os.path.exists(self.test_save_path), "Save file should exist on disk")

        print("  WHEN    Opening Game Menu and requesting Restart Quest")
        self.player.open_game_menu()
        self.player.click_menu_restart_quest()
        self.assertTrue(self.player.is_restart_confirm_open(), "Restart Confirmation Modal should be open")

        print("  WHEN    Clicking 'YES, RESTART QUEST'")
        confirm_res = self.player.confirm_restart_quest()
        self.assertTrue(confirm_res.get("success", False), "confirm_restart_quest failed")

        print("  THEN    Confirmation modal and Game Menu are both closed")
        self.assertFalse(self.player.is_restart_confirm_open(), "Confirmation modal should be closed")
        self.assertFalse(self.player.is_game_menu_open(), "Game Menu should be closed")

        print("  AND     Save file on disk is deleted")
        self.assertFalse(os.path.exists(self.test_save_path), "Save file must be deleted upon confirmed restart")

        print("  AND     Game reloads from cartridge to Round 1 with Barbarian restored at stair")
        reset_st = self.player.get_state()
        self.assertEqual(reset_st.get("round"), 1, "Game round should be reset to 1")

        barb_card = next(h for h in reset_st.get("characterCards", []) if h.get("id") == "barbarian")
        self.assertEqual(barb_card.get("current_bp"), 8, "Barbarian BP should be restored to 8")

        stair = reset_st.get("startingStair", [0, 1])
        barb_hero = next(h for h in reset_st.get("heroes", []) if h.get("id") == "barbarian")
        self.assertEqual(barb_hero.get("grid_pos"), stair, "Barbarian should be back at starting stairwell")
        print("    ✔  [ASSERTION]  Save file removed, Round 1 restored, heroes reset to starting positions")

    def test_03_quest_complete_modal_restart_requires_confirm(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 03: Quest Complete modal's restart button prompts confirmation before resetting")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Quest Complete Victory modal is displayed")
        self.player.execute_action("open_quest_complete_modal", is_victory=True)
        st_qc = self.player.get_state()
        self.assertTrue(st_qc.get("questCompleteModalOpen", False) or st_qc.get("isQuestCompleteModalOpen", False))

        print("  WHEN    Restart is requested")
        self.player.request_restart_quest()

        print("  THEN    Restart Confirmation Modal is displayed on top")
        self.assertTrue(self.player.is_restart_confirm_open(), "Restart Confirmation Modal should be open")

        print("  WHEN    User confirms restart")
        self.player.confirm_restart_quest()

        print("  THEN    Modals close and game resets to Round 1")
        reset_st = self.player.get_state()
        self.assertFalse(self.player.is_restart_confirm_open(), "Confirmation modal should be closed")
        self.assertEqual(reset_st.get("round"), 1, "Game round should be reset to 1")
        print("    ✔  [ASSERTION]  Quest Complete modal restart correctly confirmed and executed")


if __name__ == "__main__":
    unittest.main()
