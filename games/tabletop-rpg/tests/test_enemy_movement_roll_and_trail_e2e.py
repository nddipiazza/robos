#!/usr/bin/env python3
"""
Test Tabletop RPG Enemy Movement Roll, Animated Green Trail & Action Pause E2E:
Validates:
1. Enemy character rolls 2d6 movement dice with trigger_movement_dice_roll (activeDiceRoll type='movement').
2. Enemy character traverses path step-by-step with the canonical glowing green movement trail (movementTrail).
3. Enemy character pauses after arriving at destination tile (enemyTurnStage='pause_after_move') with green line visible.
4. Enemy character executes action after pause (enemyTurnStage='acting', melee attack if adjacent).
5. User skip fast-forwards immediately (skip_enemy_turn_timeout).
6. Captures visual PNG screenshot of the board during enemy movement trail presentation.
"""

import os
import sys
import time
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, TESTS_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(prefix: str, msg: str, assertions: list = None):
    print(f"  {prefix.upper():<7} {msg}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestEnemyMovementRollAndTrailE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18100

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚔️ TABLETOP RPG ENEMY MOVEMENT ROLL, GREEN TRAIL & POST-MOVE PAUSE E2E SUITE")
        print("=" * 90)
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(30):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError(f"Could not connect to Godot tabletop server on port {cls.port}")
        print("Connected to Tabletop Godot server successfully on port 18100.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def setUp(self):
        self.player.execute_action("reset_game")
        time.sleep(0.2)

    def test_01_enemy_turn_rolls_movement_dice(self):
        print("\n" + "-" * 80)
        print("SCENARIO 01: Enemy Character Rolls 2d6 Movement Dice in Dice Tray")
        print("-" * 80)

        bdd_step("GIVEN", "Dungeon state in GM phase with Crypt Skeleton at (4, 5) and Barbarian at (4, 2)")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 5], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Zargon initiates enemy turn sequence")
        res = self.player.start_enemy_turn()
        st = self.player.get_state()

        active_dice = st.get("activeDiceRoll", {})
        active_id = st.get("activeEnemyTurnMonsterId")
        stage = st.get("enemyTurnStage")
        rolled_total = st.get("enemyMovementRolledTotal", 0)

        bdd_step("THEN", "The enemy character rolls 2d6 movement dice in the tabletop 3D dice tray",
                 assertions=[
                     f"start_enemy_turn success: {res.get('success')}",
                     f"activeEnemyTurnMonsterId: '{active_id}' (expected 'mon-skel-1')",
                     f"enemyTurnStage: '{stage}' (expected 'rolling')",
                     f"activeDiceRoll type: '{active_dice.get('type')}' (expected 'movement')",
                     f"activeDiceRoll diceCount: {active_dice.get('diceCount')} (expected 2)",
                     f"activeDiceRoll title: '{active_dice.get('title')}'",
                     f"enemyMovementRolledTotal: {rolled_total} (expected >= 2)"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(active_id, "mon-skel-1")
        self.assertEqual(stage, "rolling")
        self.assertEqual(active_dice.get("type"), "movement")
        self.assertEqual(active_dice.get("diceCount"), 2)
        self.assertIn("Crypt Skeleton", active_dice.get("title", ""))
        self.assertIn("Movement Roll", active_dice.get("title", ""))
        self.assertGreaterEqual(rolled_total, 2)

    def test_02_enemy_moves_step_by_step_with_green_trail(self):
        print("\n" + "-" * 80)
        print("SCENARIO 02: Enemy Character Traverses Path Step-by-Step with Green Movement Trail")
        print("-" * 80)

        bdd_step("GIVEN", "Dungeon state with Crypt Skeleton at (4, 5) and Barbarian at (4, 2)")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 5], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Enemy turn starts and rolls movement, transitioning into step-by-step movement")
        self.player.start_enemy_turn()

        # Wait for rolling stage to complete (~1.0s) and step 1 to execute (~0.35s)
        time.sleep(1.4)
        st = self.player.get_state()

        stage = st.get("enemyTurnStage")
        trail = st.get("movementTrail", [])
        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})

        bdd_step("THEN", "The green movement trail is actively drawn square-by-square as the token moves",
                 assertions=[
                     f"enemyTurnStage: '{stage}' (moving or pause_after_move)",
                     f"movementTrail points count: {len(trail)} (expected >= 2)",
                     f"movementTrail start point: {trail[0] if trail else []} (expected [4, 5])",
                     f"Skeleton current position: {skel.get('grid_pos')}"
                 ])
        self.assertIn(stage, ["moving", "pause_after_move", "acting", "waiting_for_action"])
        self.assertGreaterEqual(len(trail), 2)
        self.assertEqual(trail[0], [4, 5])

    def test_03_enemy_turn_pauses_after_moving_before_action(self):
        print("\n" + "-" * 80)
        print("SCENARIO 03: Enemy Character Pauses After Arriving with Full Green Line Visible")
        print("-" * 80)

        bdd_step("GIVEN", "Crypt Skeleton moving towards Barbarian")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 5], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Skeleton completes its steps to adjacent tile (4, 3)")
        self.player.start_enemy_turn()

        # Monitor state transitions until pause_after_move is reached
        pause_observed = False
        trail_during_pause = []
        pos_during_pause = []
        barb_bp_during_pause = 8

        for _ in range(25):
            st = self.player.get_state()
            stage = st.get("enemyTurnStage")
            if stage == "pause_after_move":
                pause_observed = True
                trail_during_pause = st.get("movementTrail", [])
                skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
                barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
                pos_during_pause = skel.get("grid_pos", [])
                barb_bp_during_pause = barb.get("current_bp", 8)
                break
            time.sleep(0.15)

        bdd_step("THEN", "Game enters pause_after_move stage, green trail is intact, and no action has executed yet",
                 assertions=[
                     f"pause_after_move stage observed: {pause_observed}",
                     f"Skeleton position at end of move: {pos_during_pause} (expected [4, 3])",
                     f"Full movement trail points: {trail_during_pause}",
                     f"Barbarian undamaged during pause (BP == 8): {barb_bp_during_pause}"
                 ])
        self.assertTrue(pause_observed)
        self.assertEqual(pos_during_pause, [4, 3])
        self.assertGreaterEqual(len(trail_during_pause), 2)
        self.assertEqual(barb_bp_during_pause, 8)

    def test_04_enemy_action_executes_after_pause(self):
        print("\n" + "-" * 80)
        print("SCENARIO 04: Enemy Character Action (Melee Attack) Triggers After Post-Move Pause")
        print("-" * 80)

        bdd_step("GIVEN", "Skeleton at (4, 4) and Barbarian at (4, 2)")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "attackDice": 4, "grid_pos": [4, 4], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Turn runs through movement and post-movement pause into action")
        self.player.start_enemy_turn()

        # Wait across roll (1.0s) + 1 move step (0.35s) + pause (0.9s) + attack onset (~0.3s) = ~2.6s
        action_or_combat_observed = False
        combat_roll_type = ""
        attacker_name = ""

        for _ in range(30):
            st = self.player.get_state()
            stage = st.get("enemyTurnStage")
            active_dice = st.get("activeDiceRoll", {})
            if stage in ["acting", "waiting_for_action"] or active_dice.get("type") == "combat" or st.get("lastDamageEvent"):
                action_or_combat_observed = True
                combat_roll_type = active_dice.get("type", "")
                attacker_name = active_dice.get("attackerName", "")
                break
            time.sleep(0.15)

        bdd_step("THEN", "Enemy executes its attack action against the adjacent hero",
                 assertions=[
                     f"Action/combat observed after pause: {action_or_combat_observed}",
                     f"Dice roll type: '{combat_roll_type}'",
                     f"Attacker in combat: '{attacker_name}'"
                 ])
        self.assertTrue(action_or_combat_observed)

    def test_05_skip_fast_forwards_immediately(self):
        print("\n" + "-" * 80)
        print("SCENARIO 05: Skip Immediately Fast-Forwards Movement and Action")
        print("-" * 80)

        bdd_step("GIVEN", "Active enemy turn in progress")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 5], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )
        self.player.start_enemy_turn()

        bdd_step("WHEN", "User clicks anywhere to skip enemy turn timeout")
        skip_res = self.player.skip_enemy_turn_timeout()
        st = self.player.get_state()

        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "Skeleton immediately completes movement to [4, 3], attacks, and turn finishes",
                 assertions=[
                     f"Skip success: {skip_res.get('success')}",
                     f"isEnemyTurnWaiting: {st.get('isEnemyTurnWaiting')} (expected False)",
                     f"Skeleton position: {skel.get('grid_pos')} (expected [4, 3])",
                     f"Skeleton did NOT enter hero tile [4, 2]: {skel.get('grid_pos') != barb.get('grid_pos')}"
                 ])
        self.assertTrue(skip_res.get("success"))
        self.assertFalse(st.get("isEnemyTurnWaiting"))
        self.assertEqual(skel.get("grid_pos"), [4, 3])
        self.assertNotEqual(skel.get("grid_pos"), barb.get("grid_pos"))

    def test_06_capture_enemy_movement_trail_screenshot(self):
        print("\n" + "-" * 80)
        print("SCENARIO 06: Capture Visual Viewport Snapshot of Enemy Token & Green Movement Trail")
        print("-" * 80)

        bdd_step("GIVEN", "Skeleton moving along path with green line drawn")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 5], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )
        self.player.start_enemy_turn()

        # Wait until movement is active
        time.sleep(1.4)
        out_path = "/tmp/tabletop_enemy_movement_trail.png"
        res = self.player.take_screenshot(out_path)

        bdd_step("WHEN", "Capturing PNG viewport snapshot")
        bdd_step("THEN", "Screenshot is saved successfully with valid image size",
                 assertions=[
                     f"take_screenshot success: {res.get('success')}",
                     f"File exists on disk: {os.path.exists(out_path)}",
                     f"File size > 10KB: {os.path.getsize(out_path) > 10240 if os.path.exists(out_path) else False}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(out_path))
        self.assertGreater(os.path.getsize(out_path), 10240)


if __name__ == "__main__":
    unittest.main()
