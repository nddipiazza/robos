#!/usr/bin/env python3
"""
BDD E2E Test Suite: Quest Begin Guard for Elf Spell Selection & Armory Loading

Feature:
  As an adventurer or DM playing RobOS Tabletop RPG:
  I want Elf spell selection and the Imperial Armory to ONLY load when the game state is "quest begin"
  So that when resuming a game in progress from autosave, I am never interrupted by spell selection
  or equipment shop popups in the middle of a dungeon run.

Scenarios:
  1. Pristine quest start / force-reload initializes gameState to "quest_begin" (isQuestBegin = True).
  2. At quest_begin in player mode, Elf spell selection modal is loaded.
  3. Confirming Elf spells at quest_begin transitions to Armory modal if party has gold.
  4. Movement or actions transition gameState from "quest_begin" to "in_progress" (isQuestBegin = False).
  5. Closing and relaunching an in-progress saved game loads directly into the dungeon without
     presenting Elf spell selection or the Armory (both modals remain hidden).
  6. Force reloading with `--reset` restores gameState back to "quest_begin".
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


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 90}")
    print(f"🛡️ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 90}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestQuestBeginModalLoadingE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🛡️ FEATURE: Only Load Elf Spell Selection & Armory if Game State == Quest Begin")
        print("=" * 90)
        cls.port = 18155
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.test_save_path = f"/tmp/tabletop_quest_begin_test_{cls.port}.json"

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

    def _start_game(self, extra_args=None, extra_env=None, headless=True):
        env = dict(
            os.environ,
            TABLETOP_SERVER_PORT=str(self.port),
            TABLETOP_SAVE_PATH=self.test_save_path
        )
        if extra_env:
            env.update(extra_env)

        cmd = ["xvfb-run", "--auto-servernum", self.play_script, "--role=player"]
        if headless:
            cmd.append("--headless")
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

    def test_01_pristine_start_reports_quest_begin(self):
        bdd_scenario_header(1, "Pristine start reports gameState == 'quest_begin'")

        if os.path.exists(self.test_save_path):
            os.remove(self.test_save_path)

        bdd_step("GIVEN", "Game launched fresh with --reset")
        self._start_game(extra_args=["--reset"])

        bdd_step("WHEN", "Querying game state telemetry")
        st = self.player.get_state()

        bdd_step("THEN", "Game state is 'quest_begin' and isQuestBegin is True",
                 info=f"gameState: {st.get('gameState')}, isQuestBegin: {st.get('isQuestBegin')}",
                 assertions=[
                     "gameState == 'quest_begin'",
                     "isQuestBegin is True",
                     "questBegun is False"
                 ])
        self.assertEqual(st.get("gameState"), "quest_begin")
        self.assertTrue(st.get("isQuestBegin", False))
        self.assertFalse(st.get("questBegun", True))

    def test_02_gui_mode_at_quest_begin_loads_elf_spell_modal(self):
        bdd_scenario_header(2, "GUI mode at quest_begin loads Elf spell selection modal")

        if os.path.exists(self.test_save_path):
            os.remove(self.test_save_path)

        bdd_step("GIVEN", "Game launched in graphical mode (non-headless) at quest_begin")
        self._start_game(extra_args=["--reset"], headless=False)
        time.sleep(0.5)

        bdd_step("WHEN", "Inspecting modal visibility on startup")
        st = self.player.get_state()

        bdd_step("THEN", "Elf spell selection modal is loaded and visible",
                 info=f"elfSpellModalVisible: {st.get('elfSpellModalVisible')}",
                 assertions=["elfSpellModalVisible is True"])
        self.assertTrue(st.get("elfSpellModalVisible", False), "Elf spell modal should be visible on fresh quest start in GUI mode")

    def test_03_confirming_spells_at_quest_begin_opens_armory_if_gold(self):
        bdd_scenario_header(3, "Confirming Elf spells at quest_begin opens Armory modal")

        if os.path.exists(self.test_save_path):
            os.remove(self.test_save_path)

        bdd_step("GIVEN", "Game at quest_begin with party treasury")
        self._start_game(extra_args=["--reset"], headless=False)
        time.sleep(0.4)

        # Give party gold so they have treasury to shop at armory
        heroes = self.player.get_state().get("heroes", [])
        for h in heroes:
            if h.get("id") == "barbarian":
                h["gold"] = 200
        self.player.set_state(heroes=heroes)

        bdd_step("WHEN", "Elf selects element and confirms spell selection")
        res = self.player.select_elf_element("water", confirm=True)
        time.sleep(0.3)
        st = self.player.get_state()

        bdd_step("THEN", "Elf spell modal closes and Armory modal opens",
                 info=f"armoryModalVisible: {st.get('armoryModalVisible')}, partyTotalGold: {st.get('partyTotalGold')}",
                 assertions=[
                     "elfSpellModalVisible is False",
                     "armoryModalVisible is True (since party has gold)"
                 ])
        self.assertFalse(st.get("elfSpellModalVisible", True))
        self.assertTrue(st.get("armoryModalVisible", False), "Armory should open after spell selection at quest_begin")

    def test_04_actions_transition_game_state_to_in_progress(self):
        bdd_scenario_header(4, "Hero actions transition gameState to 'in_progress'")

        if os.path.exists(self.test_save_path):
            os.remove(self.test_save_path)

        bdd_step("GIVEN", "Game at quest_begin")
        self._start_game(extra_args=["--reset"])
        self.assertEqual(self.player.get_game_state(), "quest_begin")

        bdd_step("WHEN", "Barbarian rolls movement dice and takes a step")
        roll = self.player.roll_movement()
        self.assertTrue(roll.get("success", False))

        bdd_step("THEN", "Game state transitions to 'in_progress' and isQuestBegin becomes False",
                 info=f"gameState: {self.player.get_game_state()}, isQuestBegin: {self.player.is_quest_begin()}",
                 assertions=[
                     "gameState == 'in_progress'",
                     "isQuestBegin is False"
                 ])
        self.assertEqual(self.player.get_game_state(), "in_progress")
        self.assertFalse(self.player.is_quest_begin())

    def test_05_mid_quest_relaunch_never_loads_elf_spell_modal_or_armory(self):
        bdd_scenario_header(5, "Mid-quest relaunch never loads Elf spell modal or Armory")

        if os.path.exists(self.test_save_path):
            os.remove(self.test_save_path)

        bdd_step("GIVEN", "Game played into round 1 mid-quest with moves and autosaved")
        self._start_game(extra_args=["--reset"], headless=False)
        time.sleep(0.4)
        # Confirm spell modal and close armory
        self.player.select_elf_element("water", confirm=True)
        time.sleep(0.2)
        self.player.execute_action("close_armory")
        time.sleep(0.2)
        # Advance Barbarian
        self.player.roll_movement()
        self.player.move(4, 1)
        self.player.save_game()

        st_mid = self.player.get_state()
        self.assertEqual(st_mid.get("gameState"), "in_progress")
        self.assertFalse(st_mid.get("isQuestBegin", True))

        bdd_step("WHEN", "Stopping game process and relaunching without --reset (resuming saved quest)")
        self._stop_game()
        time.sleep(0.5)

        # Relaunch in GUI mode
        self._start_game(extra_args=[], headless=False)
        time.sleep(0.5)

        st_resumed = self.player.get_state()

        bdd_step("THEN", "Game resumes in 'in_progress' state with neither modal loaded",
                 info=f"gameState: {st_resumed.get('gameState')}, elfModal: {st_resumed.get('elfSpellModalVisible')}, armoryModal: {st_resumed.get('armoryModalVisible')}",
                 assertions=[
                     "gameState == 'in_progress'",
                     "isQuestBegin is False",
                     "elfSpellModalVisible is False",
                     "armoryModalVisible is False"
                 ])
        self.assertEqual(st_resumed.get("gameState"), "in_progress")
        self.assertFalse(st_resumed.get("isQuestBegin", True))
        self.assertFalse(st_resumed.get("elfSpellModalVisible", True), "Elf spell modal MUST NOT load mid-quest")
        self.assertFalse(st_resumed.get("armoryModalVisible", True), "Armory modal MUST NOT load mid-quest")

    def test_06_force_reload_with_reset_flag_restores_quest_begin(self):
        bdd_scenario_header(6, "Force reload with --reset restores gameState to 'quest_begin'")

        bdd_step("GIVEN", "Saved game was in progress")
        self.assertTrue(os.path.exists(self.test_save_path))

        bdd_step("WHEN", "Launching game with '--reset'")
        self._start_game(extra_args=["--reset"])

        st = self.player.get_state()

        bdd_step("THEN", "Game state is restored to 'quest_begin'",
                 info=f"gameState: {st.get('gameState')}, isQuestBegin: {st.get('isQuestBegin')}",
                 assertions=[
                     "gameState == 'quest_begin'",
                     "isQuestBegin is True"
                 ])
        self.assertEqual(st.get("gameState"), "quest_begin")
        self.assertTrue(st.get("isQuestBegin", False))


if __name__ == "__main__":
    unittest.main()
