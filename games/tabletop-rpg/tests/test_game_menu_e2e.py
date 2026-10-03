#!/usr/bin/env python3
"""
BDD E2E Test Suite: In-Game Game Menu ("Restart Quest", "Save Game State", "Load Game State")

Feature:
  As an adventurer playing RobOS Tabletop RPG:
  I want a unified Game Menu accessible from the header bar and keyboard [Esc]
  So that I can Restart the Quest, Save the current Game State, or Load a previously saved state.

Scenarios:
  1. The header bar displays the Game Menu button and standalone reset button is moved.
  2. Opening the Game Menu presents the modal with session information and action buttons.
  3. Clicking 'Save Game State' persists current hero positions and vitals to disk.
  4. Clicking 'Load Game State' restores previous quest progress from disk.
  5. Clicking 'Restart Quest' wipes the saved game, resets the quest to Round 1, and restores the starting board.
  6. Closing the Game Menu resumes gameplay and dismisses the modal.
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


class TestGameMenuE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18136
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.temp_save_dir = "/tmp/tabletop_game_menu_test_dir"
        os.makedirs(cls.temp_save_dir, exist_ok=True)
        cls.test_save_path = os.path.join(cls.temp_save_dir, "test_game_menu_save.json")

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

    def test_01_game_menu_button_present_and_standalone_reset_moved(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 01: Game Menu button present on header and standalone reset moved")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game is loaded and header UI is initialized")
        st = self.player.get_state()

        print("  WHEN    Inspecting UI nodes in the scene hierarchy")
        scene_ui = st.get("scene", {}).get("ui", {})
        header_btns = scene_ui.get("headerButtons", [])

        # Verify standalone BtnResetQuest is not present
        self.assertNotIn("BtnResetQuest", header_btns, "Standalone BtnResetQuest was still found in header buttons!")

        # Verify BtnGameMenu is present
        self.assertIn("BtnGameMenu", header_btns, "BtnGameMenu was not found in header buttons!")
        print(f"    ✔  [ASSERTION]  Header buttons: {header_btns}")
        print("    ✔  [ASSERTION]  Standalone 'BtnResetQuest' has been cleanly replaced by 'BtnGameMenu'")

    def test_02_open_and_close_game_menu(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 02: Open, close, and toggle Game Menu modal")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game Menu is initially closed")
        self.assertFalse(self.player.is_game_menu_open(), "Game menu should not be open on fresh startup")

        print("  WHEN    open_game_menu is invoked")
        res = self.player.open_game_menu()
        self.assertTrue(res.get("success", False), "open_game_menu failed")

        print("  THEN    Game Menu modal is visible in telemetry")
        self.assertTrue(self.player.is_game_menu_open(), "Game menu was not reported as open")

        print("  WHEN    close_game_menu is invoked")
        res_close = self.player.close_game_menu()
        self.assertTrue(res_close.get("success", False), "close_game_menu failed")

        print("  THEN    Game Menu modal is hidden")
        self.assertFalse(self.player.is_game_menu_open(), "Game menu was still reported as open")

        print("  WHEN    toggle_game_menu is invoked")
        self.player.toggle_game_menu()
        self.assertTrue(self.player.is_game_menu_open(), "toggle_game_menu failed to open menu")
        self.player.toggle_game_menu()
        self.assertFalse(self.player.is_game_menu_open(), "toggle_game_menu failed to close menu")
        print("    ✔  [ASSERTION]  Game Menu modal opens, closes, and toggles cleanly")

    def test_03_save_game_state_from_menu(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 03: 'Save Game State' from Game Menu persists progress to disk")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Hero party at Round 3 with Dwarf at [4, 5]")
        self.player.set_state(
            active_hero="dwarf",
            current_round=3,
            heroes=[
                {"id": "dwarf", "name": "Dorgan", "grid_pos": [4, 5], "current_bp": 6, "bodyPoints": 7, "gold": 90}
            ]
        )

        print("  WHEN    Opening Game Menu and executing 'Save Game State'")
        self.player.open_game_menu()
        res = self.player.save_game_state()
        self.assertTrue(res.get("success", False), "Save game state failed")

        print("  THEN    Save file exists on disk with accurate hero telemetry")
        self.assertTrue(os.path.exists(self.test_save_path), f"Save file {self.test_save_path} was not created")

        with open(self.test_save_path, "r") as f:
            data = json.load(f)

        self.assertEqual(data.get("current_round"), 3)
        dwarf = next(h for h in data.get("heroes", []) if h.get("id") == "dwarf")
        self.assertEqual(dwarf.get("grid_pos"), [4, 5])
        self.assertEqual(dwarf.get("gold"), 90)
        print(f"    ✔  [ASSERTION]  Save confirmed on disk: Round 3, Dwarf at [4, 5], 90 Gold")

    def test_04_load_game_state_from_menu(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 04: 'Load Game State' from Game Menu restores saved session")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        # 1. Save state at Round 4 with Telor the Wizard
        print("  GIVEN   A saved session with Wizard at [6, 7] and spent spell")
        self.player.set_state(
            active_hero="wizard",
            current_round=4,
            heroes=[
                {"id": "wizard", "name": "Telor", "grid_pos": [6, 7], "current_bp": 3, "used_spells": ["fire_of_wrath"]}
            ]
        )
        self.player.save_game_state()

        # 2. Corrupt / change active state (e.g. change round to 10 and position to [1, 1])
        print("  WHEN    Game state drifts (Round changed to 10, Wizard at [1, 1])")
        self.player.set_state(
            active_hero="wizard",
            current_round=10,
            heroes=[{"id": "wizard", "grid_pos": [1, 1], "current_bp": 1}],
            skip_save=True
        )
        drifted_st = self.player.get_state()
        self.assertEqual(drifted_st.get("round"), 10)

        # 3. Load game state from Game Menu
        print("  AND     Opening Game Menu and clicking 'Load Game State'")
        self.player.open_game_menu()
        res = self.player.load_game_state()
        self.assertTrue(res.get("success", False), "Load game state failed")

        # 4. Verify state restored to Round 4 and Wizard at [6, 7]
        print("  THEN    Restored state matches saved session (Round 4, Wizard at [6, 7])")
        restored_st = self.player.get_state()
        self.assertEqual(restored_st.get("round"), 4, "Round was not restored to 4")

        wiz_card = next(h for h in restored_st.get("characterCards", []) if h.get("id") == "wizard")
        self.assertEqual(wiz_card.get("current_bp"), 3, "Wizard BP was not restored")
        self.assertIn("fire_of_wrath", wiz_card.get("usedSpells", []), "Wizard spent spell was not restored")
        print("    ✔  [ASSERTION]  Round 4 restored and Wizard spent spell 'fire_of_wrath' verified")

    def test_05_restart_quest_from_menu(self):
        print("\n==========================================================================================")
        print("⚙️ SCENARIO 05: 'Restart Quest' from Game Menu clears save and reloads Round 1")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Active game at Round 5 with damaged Barbarian and saved game on disk")
        self.player.set_state(
            active_hero="barbarian",
            current_round=5,
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [7, 7], "current_bp": 2, "bodyPoints": 8}
            ]
        )
        self.player.save_game_state()
        self.assertTrue(os.path.exists(self.test_save_path), "Save file should exist before restart")

        print("  WHEN    Opening Game Menu and clicking 'Restart Quest'")
        self.player.open_game_menu()
        self.assertTrue(self.player.is_game_menu_open())

        res = self.player.restart_quest(clear_save=True)
        self.assertTrue(res.get("success", False), "Restart quest failed")

        print("  THEN    Save file is removed from disk")
        self.assertFalse(os.path.exists(self.test_save_path), "Save file was not deleted upon restart quest")

        print("  AND     Game is reset to Round 1 with Barbarian restored to 8 BP at starting stair")
        reset_st = self.player.get_state()
        self.assertEqual(reset_st.get("round"), 1, "Round was not reset to 1")
        self.assertFalse(self.player.is_game_menu_open(), "Game menu should automatically close upon restart")

        barb_card = next(h for h in reset_st.get("characterCards", []) if h.get("id") == "barbarian")
        self.assertEqual(barb_card.get("current_bp"), 8, "Barbarian BP was not reset to 8")
        stair = reset_st.get("startingStair", [0, 1])

        barb_hero = next(h for h in reset_st.get("heroes", []) if h.get("id") == "barbarian")
        self.assertEqual(barb_hero.get("grid_pos"), stair, "Barbarian was not reset to starting stair")
        print("    ✔  [ASSERTION]  Save file cleared, Round 1 restored, Barbarian at full 8 BP at stairwell")


if __name__ == "__main__":
    unittest.main()
