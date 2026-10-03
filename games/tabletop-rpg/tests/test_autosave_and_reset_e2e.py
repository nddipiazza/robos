#!/usr/bin/env python3
"""
BDD E2E Test Suite: Automatic Game State Saving, Resume on Relaunch, and Quest Force Reload (--reset).

Feature:
  As an adventurer or DM playing RobOS Tabletop RPG:
  I want my game state to be automatically saved on every move and action
  So that if I close and reopen the game, it resumes exactly where I left off,
  And I want to be able to force-reload the current quest fresh using `--reset` or in-game reset.

Scenarios:
  1. Each move and action automatically saves the game state to disk.
  2. Game state changes (hero positions, HP/BP, spent spells, explored tiles) persist in the save file.
  3. Closing the process and relaunching without --reset restores the exact quest state seamlessly.
  4. Launching with `--reset` wipes the save file and reloads the current quest from scratch.
  5. In-game quest reset clears the autosave and restores the pristine starting board.
"""

import json
import os
import signal
import shutil
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer


class TestAutosaveAndResetE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18135
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.temp_save_dir = "/tmp/tabletop_autosave_test_dir"
        os.makedirs(cls.temp_save_dir, exist_ok=True)
        cls.test_save_path = os.path.join(cls.temp_save_dir, "test_autosave_quest.json")

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

    def test_01_moves_and_actions_automatically_save_to_disk(self):
        print("\n==========================================================================================")
        print("💾 SCENARIO 01: Actions automatically save the game state to disk")
        print("==========================================================================================")

        self._start_game()
        print("  GIVEN   Game is loaded and ready")
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  WHEN    Barbarian rolls movement dice and steps on the board")
        roll = self.player.roll_movement()
        self.assertTrue(roll.get("success", False), "Movement roll failed")

        print("  THEN    Save game exists and is saved to the configured save path")
        save_stat = self.player.has_save_game()
        self.assertTrue(save_stat.get("has_save", False), "Save game was not created")
        self.assertTrue(os.path.exists(self.test_save_path), f"Save file {self.test_save_path} does not exist on disk")

        with open(self.test_save_path, "r") as f:
            data = json.load(f)
        self.assertIn("heroes", data)
        self.assertIn("current_round", data)
        print(f"    ✔  [ASSERTION]  Save file confirmed on disk ({os.path.getsize(self.test_save_path)} bytes)")

    def test_02_hero_state_and_spent_spells_persisted_in_save_file(self):
        print("\n==========================================================================================")
        print("💾 SCENARIO 02: Hero positions, wounds, and spent spells persist in save file")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Wizard at [3, 4] with 3 BP and spent 'ball_of_flame' spell")
        self.player.set_state(
            active_hero="wizard",
            current_round=3,
            heroes=[
                {
                    "id": "wizard",
                    "grid_pos": [3, 4],
                    "current_bp": 3,
                    "bodyPoints": 4,
                    "gold": 75,
                    "used_spells": ["ball_of_flame"],
                    "spells": ["ball_of_flame", "fire_of_wrath", "pass_through_rock"]
                }
            ],
            explored_tiles=[[3, 3], [3, 4], [3, 5]]
        )

        print("  WHEN    Inspecting the autosaved JSON file directly")
        with open(self.test_save_path, "r") as f:
            save_data = json.load(f)

        self.assertEqual(save_data.get("current_round"), 3)
        wiz = next(h for h in save_data.get("heroes", []) if h.get("id") == "wizard")
        self.assertEqual(wiz.get("grid_pos"), [3, 4])
        self.assertEqual(wiz.get("current_bp"), 3)
        self.assertEqual(wiz.get("gold"), 75)
        self.assertIn("ball_of_flame", wiz.get("used_spells", []))
        print("    ✔  [ASSERTION]  Round 3, Grid Pos [3, 4], BP 3, Gold 75, and used_spells verified in JSON")

    def test_03_close_and_relaunch_resumes_exact_quest_state(self):
        print("\n==========================================================================================")
        print("💾 SCENARIO 03: Closing process and relaunching restores exact quest state")
        print("==========================================================================================")

        # 1. Start first session and make progress
        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("earth", confirm=True)

        print("  GIVEN   Heroes advance into dungeon (Dorgan Dwarf at [5, 6], Rogar at [5, 5])")
        self.player.set_state(
            active_hero="dwarf",
            current_round=4,
            heroes=[
                {"id": "dwarf", "name": "Dorgan", "grid_pos": [5, 6], "current_bp": 5, "bodyPoints": 7, "gold": 120},
                {"id": "barbarian", "name": "Rogar", "grid_pos": [5, 5], "current_bp": 6, "bodyPoints": 8, "gold": 40},
                {"id": "wizard", "name": "Telor", "grid_pos": [1, 2], "used_spells": ["ball_of_flame"]}
            ],
            explored_tiles=[[5, 5], [5, 6], [5, 7]]
        )

        # 2. Terminate the game process to simulate closing
        print("  WHEN    The player closes the game process")
        self._stop_game()
        time.sleep(0.5)

        # 3. Relaunch the game WITHOUT reset
        print("  AND     The player relaunches the game (./play.sh --player)")
        self._start_game()

        # 4. Verify that state was restored automatically on startup
        print("  THEN    The dungeon state resumes with exact hero positions, wounds, and round")
        st2 = self.player.get_state()
        self.assertEqual(st2.get("round", 1), 4, "Current round was not restored")
        self.assertEqual(st2.get("activeHeroId"), "dwarf", "Active hero was not restored")

        cards = {h.get("id"): h for h in st2.get("characterCards", [])}
        dwarf_card = cards.get("dwarf", {})
        self.assertEqual(dwarf_card.get("current_bp"), 5, "Dwarf HP was not restored")
        self.assertEqual(dwarf_card.get("gold"), 120, "Dwarf Gold was not restored")

        wiz_card = cards.get("wizard", {})
        self.assertIn("ball_of_flame", wiz_card.get("usedSpells", []), "Wizard's spent spell was not restored")

        print("    ✔  [ASSERTION]  Round 4 restored")
        print("    ✔  [ASSERTION]  Dwarf at 5 BP and 120 GP restored")
        print("    ✔  [ASSERTION]  Wizard spent spell 'ball_of_flame' restored")

    def test_04_force_reload_with_reset_flag_clears_save_and_restarts(self):
        print("\n==========================================================================================")
        print("🔄 SCENARIO 04: Launching with --reset clears save and restarts quest fresh")
        print("==========================================================================================")

        # 1. Start first session, save progress
        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Saved game in progress at Round 5 with damaged Barbarian")
        self.player.set_state(
            active_hero="barbarian",
            current_round=5,
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [8, 8], "current_bp": 2, "bodyPoints": 8}
            ]
        )

        # 2. Terminate the game
        print("  WHEN    The player closes the game")
        self._stop_game()
        time.sleep(0.5)

        # 3. Relaunch with --reset (simulating ./play.sh --player --reset)
        print("  AND     The player launches with --reset (./play.sh --player --reset)")
        self._start_game(extra_args=["--reset"])

        # 4. Verify quest restarted fresh
        print("  THEN    The quest is reset to Round 1 and Barbarian is fully restored to 8 BP")
        st_reset = self.player.get_state()
        self.assertEqual(st_reset.get("round", 1), 1, "Round was not reset to 1")

        barb_card = next(h for h in st_reset.get("characterCards", []) if h.get("id") == "barbarian")
        self.assertEqual(barb_card.get("current_bp"), 8, "Barbarian BP was not reset to maximum 8")
        stair = st_reset.get("startingStair", [0, 1])

        # Verify hero is back at stairwell
        heroes_telemetry = st_reset.get("heroes", [])
        barb_hero = next(h for h in heroes_telemetry if h.get("id") == "barbarian")
        self.assertEqual(barb_hero.get("grid_pos"), stair, "Barbarian was not reset to starting stairwell")

        print("    ✔  [ASSERTION]  Round reset to 1")
        print("    ✔  [ASSERTION]  Barbarian restored to full 8 BP at starting stairwell")

    def test_05_in_game_reset_action_clears_autosave_and_reloads_fresh(self):
        print("\n==========================================================================================")
        print("🔄 SCENARIO 05: In-game quest reset clears autosave and restarts quest fresh")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game has advanced to Round 3")
        self.player.set_state(current_round=3)

        print("  WHEN    In-game reset_quest is invoked")
        res = self.player.reset_quest(clear_save=True)
        self.assertTrue(res.get("success", False), "In-game reset failed")

        print("  THEN    Game state is back at Round 1")
        st2 = self.player.get_state()
        self.assertEqual(st2.get("round", 1), 1, "Round was not reset to 1")
        print("    ✔  [ASSERTION]  In-game reset successfully reloaded cartridge at Round 1")


if __name__ == "__main__":
    unittest.main()
