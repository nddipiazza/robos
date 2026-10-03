#!/usr/bin/env python3
"""
BDD E2E Test Suite: RobOS Tabletop RPG Autonomous Engine AI Demo Mode (--player --demo)

Feature:
  As a player, DM, or automated harness running RobOS Tabletop RPG:
  I want to launch the game with `--player --demo`
  So that the RobOS tabletop engine AI plays the game against itself,
  where the Mentor Autonomous Party Harness wields the 4 heroes (Barbarian, Dwarf, Elf, Wizard)
  as a coordinated tactical team to explore rooms, breach doors, search for treasure/traps,
  cast spells, and fight monsters, while the Zargon Dungeon Master AI commands revealed monsters
  to hunt heroes and defend the dungeon.

Scenarios:
  1. CLI `--demo` flag enables continuous autonomous AI demo mode and reports telemetry.
  2. Elf spell selection modal auto-resolves automatically without human blocker.
  3. Mentor Party AI coordinates hero movement, door breaching, and room exploration.
  4. Autonomous combat and spellcasting execution against enemy monsters.
  5. Zargon AI commands monsters during GM phase with movement and combat dice.
  6. HUD Demo toggle button and RPC commands (start_demo, stop_demo, toggle_demo, step_ai).
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
    print(f"🤖 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 90}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestTabletopAIDemoE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🤖 FEATURE: Tabletop Engine Autonomous AI Demo Mode (--player --demo)")
        print("   Mentor Autonomous Party Harness vs Zargon Dungeon Master AI")
        print("=" * 90)
        cls.port = 18145
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
        env = dict(
            os.environ,
            TABLETOP_SERVER_PORT=str(self.port),
            TABLETOP_SAVE_PATH=f"/tmp/tabletop_demo_test_{self.port}.json"
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

    def test_01_cli_demo_flag_enables_autonomous_mode(self):
        bdd_scenario_header(1, "CLI --demo flag enables continuous autonomous AI demo mode")

        bdd_step("GIVEN", "Tabletop game is launched with '--demo'")
        self._start_game(extra_args=["--demo"])

        bdd_step("WHEN", "Game state and telemetry are queried via RPC")
        st = self.player.get_state()

        bdd_step("THEN", "Demo state flags and AI engine are active",
                 info=f"isDemoActive: {st.get('isDemoActive')}, aiEngine: {st.get('aiEngine')}",
                 assertions=[
                     "isDemoActive is True",
                     "autoPlayEnabled is True",
                     "aiEngine reports 'Mentor Autonomous Party Harness vs Zargon DM'"
                 ])
        self.assertTrue(st.get("isDemoActive", False), "Expected isDemoActive to be True")
        self.assertTrue(st.get("autoPlayEnabled", False), "Expected autoPlayEnabled to be True")
        self.assertIn("Mentor", st.get("aiEngine", ""))
        self.assertIn("Zargon", st.get("aiEngine", ""))

    def test_02_elf_spell_modal_auto_resolves_in_demo_mode(self):
        bdd_scenario_header(2, "Elf spell modal auto-resolves automatically without human intervention")

        bdd_step("GIVEN", "Game launched with '--demo' and pristine save")
        save_path = f"/tmp/tabletop_demo_test_{self.port}.json"
        if os.path.exists(save_path):
            os.remove(save_path)

        self._start_game(extra_args=["--demo", "--reset"])

        bdd_step("WHEN", "Elf spell selection modal is opened in autonomous demo mode")
        self.player.execute_action("open_elf_spell_modal")
        time.sleep(0.3)
        st = self.player.get_state()

        elf_spells = st.get("spellAllocation", {}).get("elfSpells", [])
        if not elf_spells:
            for h in st.get("heroes", []):
                if h.get("id") == "elf":
                    elf_spells = h.get("spells", [])
                    break

        bdd_step("THEN", "Elf spell allocation modal is auto-confirmed and Elf has Water Magic",
                 info=f"modalVisible: {st.get('elfSpellModalVisible')}, elf spells: {elf_spells}",
                 assertions=[
                     "elfSpellModalVisible is False",
                     "Elf hero has water_of_healing in assigned spells"
                 ])
        self.assertFalse(st.get("elfSpellModalVisible", False), "Elf spell modal should auto-confirm")
        self.assertIn("water_of_healing", elf_spells)

    def test_03_mentor_ai_party_coordinates_heroes_and_doors(self):
        bdd_scenario_header(3, "Mentor Party AI coordinates 4 heroes (movement, doors, exploration)")

        bdd_step("GIVEN", "Game running in autonomous demo mode")
        self._start_game(extra_args=["--demo", "--reset"])
        time.sleep(0.5)

        initial_state = self.player.get_state()
        initial_step = initial_state.get("autoPlayStep", 0)

        bdd_step("WHEN", "Autonomous AI executes multiple party steps over 2.5 seconds")
        time.sleep(2.5)
        advanced_state = self.player.get_state()
        advanced_step = advanced_state.get("autoPlayStep", 0)
        doors = advanced_state.get("doors", [])
        open_doors = [d for d in doors if d.get("is_open", False)]

        bdd_step("THEN", "AI steps incremented, doors breached, or round progressed",
                 info=f"autoPlayStep: {initial_step} -> {advanced_step}, open doors: {len(open_doors)}, round: {advanced_state.get('round')}",
                 assertions=[
                     "autoPlayStep advanced beyond initial step",
                     "At least one door is opened or heroes progressed in dungeon"
                 ])
        self.assertGreater(advanced_step, initial_step, "Expected autonomous AI steps to advance")
        self.assertGreaterEqual(len(open_doors), 1, "Expected party to breach at least one door")

    def test_04_zargon_ai_activates_in_gm_phase(self):
        bdd_scenario_header(4, "Zargon AI executes monster activations during GM phase")

        bdd_step("GIVEN", "Game launched in autonomous demo mode")
        self._start_game(extra_args=["--demo", "--reset"])
        time.sleep(0.5)

        bdd_step("WHEN", "Letting autonomous AI advance through turns into GM phase")
        time.sleep(3.5)
        st = self.player.get_state()

        bdd_step("THEN", "Game advanced rounds and logged AI actions",
                 info=f"Round: {st.get('round')}, Phase: {st.get('phase')}, Log count: {len(st.get('combatLog', []))}",
                 assertions=[
                     "Combat log has entries from autonomous party or monsters",
                     "Round counter or step count shows active multi-turn gameplay"
                 ])
        combat_log = st.get("combatLog", [])
        self.assertGreater(len(combat_log), 0, "Combat log should contain gameplay events")
        self.assertGreaterEqual(st.get("autoPlayStep", 0), 5, "Should have executed at least 5 AI steps")

    def test_05_hud_and_rpc_demo_controls(self):
        bdd_scenario_header(5, "HUD and RPC controls can pause, resume, toggle, and step AI")

        bdd_step("GIVEN", "Game launched normally without initial --demo")
        self._start_game(extra_args=[])
        time.sleep(0.3)
        st0 = self.player.get_state()
        self.assertFalse(st0.get("isDemoActive", False), "Demo should initially be inactive")

        bdd_step("WHEN", "RPC 'start_demo' is invoked")
        res_start = self.player.start_demo()
        self.assertTrue(res_start.get("demo_active", False))
        st1 = self.player.get_state()
        self.assertTrue(st1.get("isDemoActive", False), "isDemoActive should become True")

        bdd_step("WHEN", "RPC 'stop_demo' is invoked")
        res_stop = self.player.stop_demo()
        self.assertFalse(res_stop.get("demo_active", True))
        st2 = self.player.get_state()
        self.assertFalse(st2.get("isDemoActive", True), "isDemoActive should become False")

        bdd_step("WHEN", "RPC 'toggle_demo' is invoked")
        res_toggle = self.player.toggle_demo()
        self.assertTrue(res_toggle.get("demo_active", False))
        st3 = self.player.get_state()
        self.assertTrue(st3.get("isDemoActive", False))

        bdd_step("WHEN", "RPC 'step_ai' is invoked while paused")
        self.player.stop_demo()
        step_before = self.player.get_state().get("autoPlayStep", 0)
        res_step = self.player.step_ai()
        self.assertTrue(res_step.get("stepped", False))
        step_after = self.player.get_state().get("autoPlayStep", 0)

        bdd_step("THEN", "Single step incremented autoPlayStep",
                 info=f"step_before: {step_before}, step_after: {step_after}",
                 assertions=["step_after > step_before"])
        self.assertGreater(step_after, step_before)


if __name__ == "__main__":
    unittest.main()
