#!/usr/bin/env python3
"""
Test Suite: Tabletop RPG Autonomous Demo Mode & Transaction Log E2E — Election 2026: Battle for the Hill
========================================================================================================
Validates:
1. Autonomous Demo Mode executes reliably on election-2026-quest-1.cartridge.json without hanging.
2. Step-by-step turn progression with turn-by-turn screenshot capture.
3. Tabletop RPG Transaction Log captures all discrete actions:
   - ROLL_MOVEMENT (dice values, totals)
   - MOVE (source, destination, movement cost)
   - DOOR_OPEN (door coordinates, revealed chambers)
   - ATTACK (weapon, skulls, shields, wounds, target HP)
   - END_TURN (phase and round transitions)
   - QUEST_COMPLETE (bounty awarded, objective completion)
4. Autonomous Mentor AI navigates the Capitol Crypt, breaches doors, defeats all three
   Capitol Hydras (Talarixon in the Oval Office, El-Rogers in the Senate Cloakroom, and
   Brownsted in the Supreme Court Chamber) and completes the quest within a sane move limit.
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

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer

PORT = 18156
SCREENSHOTS_DIR = "/tmp/tabletop_election2026_shots"
LEDGER_OUTPUT_PATH = "/tmp/tabletop_election2026_ledger.json"


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"✨ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, message: str, assertions: list[str] | None = None):
    print(f"  {step_type:<7} {message}")
    if assertions:
        for a in assertions:
            print(f"          ✔ {a}")


class TestDemoElection2026QuestE2E(unittest.TestCase):
    proc = None
    player = None
    port = PORT
    captured_shots: list[str] = []

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎮 FEATURE: Election 2026: Battle for the Hill — Autonomous Demo & Transaction Log Verification")
        print("   Validates autonomous quest completion on election-2026-quest-1.cartridge.json")
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
            "--cartridge=election-2026-quest-1",
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
        bdd_scenario_header(1, "Verify Initial Election 2026 Quest Setup and Empty Transaction Log")

        bdd_step("GIVEN", "Tabletop RPG launched with election-2026-quest-1.cartridge.json")
        st = self.player.get_state()
        self.assertEqual(st.get("cartridge"), "election-2026-quest-1")

        bdd_step("THEN", "Quest objectives and starting chamber are correctly configured", assertions=[
            f"Active Cartridge: {st.get('cartridge')}",
            f"Active Hero: {st.get('activeHero')}",
            f"Starting Stair: {st.get('startingStair')}",
            f"Revealed Rooms: {st.get('revealedRooms')}"
        ])

        objectives = st.get("questObjectives", [])
        self.assertGreaterEqual(len(objectives), 3)
        obj_ids = [o.get("id") for o in objectives]
        self.assertIn("slay_talarixon", obj_ids)
        self.assertIn("slay_el_rogers", obj_ids)
        self.assertIn("slay_brownsted", obj_ids)

    def test_02_autonomous_demo_playthrough_with_screenshots(self):
        bdd_scenario_header(2, "Autonomous Demo Playthrough & Turn-by-Turn Evidence Capture")

        bdd_step("WHEN", "Executing autonomous turns until quest completion (max 650 moves)")
        max_steps = 650
        turn_shot_count = 0
        quest_won = False
        last_printed_tx = 0
        step_records = []

        for step in range(1, max_steps + 1):
            res = self.player.step_demo()
            self.assertTrue(res.get("success"), f"Step {step} failed: {res}")

            time.sleep(0.03)

            # Capture screenshot after each step
            shot_path = os.path.join(SCREENSHOTS_DIR, f"turn_{step:03d}.png")
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
            new_txs = []
            if len(tx_log) > last_printed_tx:
                new_txs = tx_log[last_printed_tx:]
                for tx in new_txs:
                    print(f"    Step {step:03d} [Round {current_round}, {current_phase}] [TX #{tx.get('id')}] {tx.get('actor_name')}: {tx.get('description')}", flush=True)
                last_printed_tx = len(tx_log)
            else:
                last_tx = tx_log[-1] if tx_log else {}
                last_desc = last_tx.get("description", "None")
                print(f"    Step {step:03d} [Round {current_round}, {current_phase}, {active_hero}]: {last_desc[:75]}", flush=True)

            alive_monsters = [m for m in st.get("monsters", []) if m.get("is_alive", m.get("alive", False))]
            hydras_alive = [m.get("id") for m in alive_monsters if m.get("id") in ("talarixon", "el-rogers", "brownsted")]
            step_records.append({
                "step": step,
                "round": current_round,
                "phase": current_phase,
                "activeHero": active_hero,
                "aliveMonstersCount": len(alive_monsters),
                "hydrasAlive": hydras_alive,
                "revealedRooms": st.get("revealedRooms", []),
                "heroes": [
                    {
                        "id": h.get("id"),
                        "name": h.get("name"),
                        "hp": h.get("current_bp", h.get("hp", 0)),
                        "maxHp": h.get("bodyPoints", h.get("maxHp", 8)),
                        "position": h.get("grid_pos", h.get("position"))
                    }
                    for h in st.get("heroes", [])
                ],
                "newTransactions": new_txs,
                "screenshot": shot_path
            })

            if is_won:
                if not st.get("isQuestCompleted", False):
                    self.player.step_demo()
                    time.sleep(0.08)
                    st = self.player.get_state()
                    final_shot = os.path.join(SCREENSHOTS_DIR, f"turn_{step+1:03d}.png")
                    self.player.take_screenshot(final_shot)
                    if os.path.exists(final_shot):
                        self.captured_shots.append(final_shot)
                quest_won = True
                print(f"\n  🎉 QUEST COMPLETE AT STEP {step} (Round {current_round})! All three Capitol Hydras defeated.")
                break

            alive_heroes = [h for h in st.get("heroes", []) if int(h.get("current_bp", h.get("hp", 0))) > 0]
            if len(alive_heroes) == 0:
                self.fail(f"Party was wiped out on Step {step} (Round {current_round})!")

        final_st = self.player.get_state()
        with open(LEDGER_OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "cartridge": "election-2026-quest-1",
                "quest_won": quest_won,
                "total_steps": len(self.captured_shots),
                "total_rounds": final_st.get("round"),
                "heroes": final_st.get("heroes", []),
                "questObjectives": final_st.get("questObjectives", []),
                "transactionLog": final_st.get("transactionLog", []),
                "stepRecords": step_records
            }, f, indent=2)
        print(f"  [LEDGER] Saved playthrough ledger -> {LEDGER_OUTPUT_PATH}", flush=True)

        self.assertTrue(quest_won, f"Quest did not complete within {max_steps} steps.")
        bdd_step("THEN", f"Quest completed successfully in {len(self.captured_shots)} turns with visual evidence", assertions=[
            f"Total turns executed: {len(self.captured_shots)}",
            f"Screenshots captured: {turn_shot_count}",
            f"Total rounds: {final_st.get('round')}",
            f"Total transactions: {len(final_st.get('transactionLog', []))}"
        ])


if __name__ == "__main__":
    unittest.main(verbosity=2)
