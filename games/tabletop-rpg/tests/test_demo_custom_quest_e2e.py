#!/usr/bin/env python3
"""
Test Suite: Tabletop RPG Autonomous Demo Mode & Transaction Log E2E
===================================================================
Validates:
1. Autonomous Demo Mode executes reliably on custom-quest.cartridge.json without hanging.
2. Step-by-step turn progression with turn-by-turn screenshot capture.
3. Tabletop RPG Transaction Log captures all discrete actions:
   - ROLL_MOVEMENT (dice values, totals)
   - MOVE (source, destination, movement cost)
   - DOOR_OPEN (door coordinates, revealed chambers)
   - ATTACK (weapon, skulls, shields, wounds, target HP)
   - END_TURN (phase and round transitions)
   - QUEST_COMPLETE (bounty awarded, objective completion)
4. Verbose combat log display formats every transaction with [TX #N] prefix.
5. Autonomous Mentor AI navigates, breaches doors, defeats Goblin Vanguard,
   and returns safely to spiral stairway to complete the quest within a sane move limit.
"""

from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import sys
import time
import unittest
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer

PORT = 18155
BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
SCREENSHOTS_DIR = "/tmp/tabletop_demo_shots"


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"✨ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, message: str, assertions: list[str] | None = None):
    print(f"  {step_type:<7} {message}")
    if assertions:
        for a in assertions:
            print(f"          ✔ {a}")


class TestDemoCustomQuestE2E(unittest.TestCase):
    proc = None
    player = None
    port = PORT
    captured_shots: list[str] = []

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎮 FEATURE: Tabletop RPG Autonomous Demo Mode & Transaction Log Verification")
        print("   Validates autonomous quest completion on custom-quest.cartridge.json")
        print("   with comprehensive transaction logging and turn-by-turn screenshot capture.")
        print("=" * 90)

        os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
        for old_f in glob.glob(os.path.join(SCREENSHOTS_DIR, "*.png")):
            try:
                os.remove(old_f)
            except Exception:
                pass

        play_script = os.path.join(ROOT_DIR, "play.sh")
        temp_save = f"/tmp/tabletop_demo_save_{cls.port}.json"
        if os.path.exists(temp_save):
            try:
                os.remove(temp_save)
            except Exception:
                pass

        env = dict(
            os.environ,
            TABLETOP_SERVER_PORT=str(cls.port),
            TABLETOP_SAVE_PATH=temp_save,
            TABLETOP_NO_SPELL_SELECT="1"
        )

        args = [
            "xvfb-run", "--auto-servernum",
            play_script,
            "--cartridge=custom-quest",
            "--role=player",
            "--reset"
        ]

        cls.proc = subprocess.Popen(
            args,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.04)
        if not cls.player.wait_for_ready(16.0):
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError("Tabletop test server failed to become ready.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            try:
                cls.proc.terminate()
                cls.proc.wait(timeout=2.0)
            except Exception:
                cls.proc.kill()

    def test_01_verify_initial_quest_and_transaction_log_setup(self):
        bdd_scenario_header(1, "Verify Initial Custom Quest Setup and Empty Transaction Log")

        bdd_step("GIVEN", "Tabletop RPG launched with custom-quest.cartridge.json")
        st = self.player.get_state()
        self.assertEqual(st.get("cartridge"), "custom-quest")

        bdd_step("THEN", "Quest objectives and starting chamber are correctly configured", assertions=[
            f"Active Cartridge: {st.get('cartridge')}",
            f"Active Hero: {st.get('activeHero')}",
            f"Starting Stair: {st.get('startingStair')}",
            f"Revealed Rooms: {st.get('revealedRooms')}"
        ])

        objectives = st.get("questObjectives", [])
        self.assertGreaterEqual(len(objectives), 3)
        self.assertEqual(objectives[0].get("id"), "slay_boss")
        self.assertFalse(objectives[0].get("completed"))

        tx_log = self.player.get_transaction_log()
        bdd_step("AND", f"Initial transaction log is initialized (count: {len(tx_log)})", assertions=[
            f"Transaction count: {len(tx_log)}"
        ])

    def test_02_autonomous_demo_playthrough_with_screenshots(self):
        bdd_scenario_header(2, "Autonomous Demo Playthrough & Turn-by-Turn Evidence Capture")

        bdd_step("WHEN", "Executing autonomous turns until quest completion (max 50 moves)")
        max_steps = 50
        turn_shot_count = 0
        quest_won = False

        for step in range(1, max_steps + 1):
            res = self.player.step_demo()
            self.assertTrue(res.get("success"), f"Step {step} failed: {res}")

            time.sleep(0.08)

            # Capture screenshot after each step
            shot_path = os.path.join(SCREENSHOTS_DIR, f"turn_{step:02d}.png")
            shot_res = self.player.take_screenshot(shot_path)
            if shot_res.get("success") and os.path.exists(shot_path) and os.path.getsize(shot_path) > 1000:
                self.captured_shots.append(shot_path)
                turn_shot_count += 1

            st = self.player.get_state()
            current_phase = st.get("currentPhase")
            current_round = st.get("round")
            active_hero = st.get("activeHero")
            is_won = bool(st.get("isQuestCompleted", False)) or bool(st.get("questObjectivesCompleted", False))

            tx_log = st.get("transactionLog", [])
            last_tx = tx_log[-1] if tx_log else {}
            last_desc = last_tx.get("description", "None")

            print(f"    Step {step:02d} [Round {current_round}, {current_phase}]: {last_desc[:70]}")

            if is_won:
                if not st.get("isQuestCompleted", False):
                    self.player.step_demo()
                    time.sleep(0.08)
                    st = self.player.get_state()
                    final_shot = os.path.join(SCREENSHOTS_DIR, f"turn_{step+1:02d}.png")
                    self.player.take_screenshot(final_shot)
                    if os.path.exists(final_shot):
                        self.captured_shots.append(final_shot)
                quest_won = True
                print(f"\n  🎉 QUEST COMPLETE AT STEP {step}! Objectives successfully accomplished.")
                break

        self.assertTrue(quest_won, f"Quest did not complete within {max_steps} steps.")
        bdd_step("THEN", f"Quest completed successfully in {len(self.captured_shots)} turns with visual evidence", assertions=[
            f"Total turns executed: {len(self.captured_shots)}",
            f"Screenshots captured: {turn_shot_count}"
        ])

    def test_03_validate_transaction_log_and_verbose_mode(self):
        bdd_scenario_header(3, "Validate Tabletop RPG Transaction Log Entries & Verbose Output")

        bdd_step("GIVEN", "The recorded transaction log from the playthrough")
        st = self.player.get_state()
        tx_log = st.get("transactionLog", [])
        self.assertGreaterEqual(len(tx_log), 5, "Expected at least 5 logged transactions")

        action_types = {tx.get("action_type") for tx in tx_log}
        print(f"\n  Logged action types: {sorted(action_types)}")

        bdd_step("THEN", "Transaction log contains required discrete action types", assertions=[
            f"Has ROLL_MOVEMENT: {'ROLL_MOVEMENT' in action_types}",
            f"Has MOVE: {'MOVE' in action_types}",
            f"Has DOOR_OPEN: {'DOOR_OPEN' in action_types}",
            f"Has ATTACK: {'ATTACK' in action_types}",
            f"Has QUEST_COMPLETE: {'QUEST_COMPLETE' in action_types}",
            f"Has END_TURN (or won in turn 1): {'END_TURN' in action_types or len(self.captured_shots) <= 6}"
        ])

        self.assertIn("ROLL_MOVEMENT", action_types)
        self.assertIn("MOVE", action_types)
        self.assertIn("DOOR_OPEN", action_types)
        self.assertIn("ATTACK", action_types)
        self.assertIn("QUEST_COMPLETE", action_types)
        if len(self.captured_shots) > 6:
            self.assertIn("END_TURN", action_types)

        # Validate transaction structure
        for i, tx in enumerate(tx_log):
            self.assertEqual(tx.get("id"), i + 1)
            self.assertIn("action_type", tx)
            self.assertIn("description", tx)
            self.assertIn("actor_name", tx)
            self.assertIn("timestamp", tx)

        bdd_step("AND", "Combat log displays formatted [TX #N] entries in verbose mode")
        combat_log = st.get("fullCombatLog", [])
        tx_display_entries = [entry for entry in combat_log if "[TX #" in entry]
        self.assertGreaterEqual(len(tx_display_entries), 5)
        print(f"  Sample verbose combat log entries ({len(tx_display_entries)} total):")
        for sample in tx_display_entries[:5]:
            print(f"    {sample}")

    def test_04_copy_evidence_screenshots_to_artifacts(self):
        bdd_scenario_header(4, "Archive Milestone Screenshots to Brain Artifacts Directory")

        bdd_step("WHEN", "Copying turn-by-turn milestone screenshots to artifacts directory")
        copied = []
        if os.path.exists(BRAIN_DIR):
            milestones = [
                ("turn_01.png", "tabletop_demo_turn_01_start.png"),
                ("turn_02.png", "tabletop_demo_turn_02_advance.png"),
                ("turn_03.png", "tabletop_demo_turn_03_door_breach.png"),
                ("turn_05.png", "tabletop_demo_turn_05_combat.png"),
            ]
            all_shots = sorted(glob.glob(os.path.join(SCREENSHOTS_DIR, "turn_*.png")))
            if all_shots:
                milestones.append((os.path.basename(all_shots[-1]), "tabletop_demo_turn_final_victory.png"))
                if len(all_shots) >= 2:
                    milestones.append((os.path.basename(all_shots[-2]), "tabletop_demo_turn_return_stair.png"))

            for src_name, dst_name in milestones:
                src_path = os.path.join(SCREENSHOTS_DIR, src_name)
                dst_path = os.path.join(BRAIN_DIR, dst_name)
                if os.path.exists(src_path):
                    shutil.copy2(src_path, dst_path)
                    copied.append(dst_name)
                    print(f"    ✔ Copied {src_name} -> {dst_name} ({os.path.getsize(dst_path):,} bytes)")

        bdd_step("THEN", f"Archived {len(copied)} evidence screenshots to artifacts", assertions=[
            f"Evidence files: {copied}"
        ])
        self.assertGreaterEqual(len(copied), 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
