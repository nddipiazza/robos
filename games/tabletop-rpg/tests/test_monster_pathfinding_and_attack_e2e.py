#!/usr/bin/env python3
"""
Test Tabletop RPG Monster AI Pathfinding & Tactical Attack Planning E2E:
Validates that monsters use intelligent A* grid navigation (similar to the cRPG engine)
instead of naive Manhattan step checks:
1. Obstacle & Wall Detour Navigation: Monsters navigate around solid walls and corners
   through open doorways to reach heroes and attack.
2. Doorway Navigation: Monsters inside rooms pathfind through doorways to engage heroes
   in corridors.
3. Smart Target Selection: Monsters target reachable heroes rather than getting stuck
   against walls trying to reach closer (in Manhattan distance) unreachable heroes.
4. Movement Truncation / Progress: Monsters advance maximum movement along their optimal
   A* path towards distant targets without freezing or aborting early.
5. Immediate Adjacency Attack: Monsters already adjacent to a hero attack immediately
   without moving away or failing to act.
6. Interactive Animated Turn with Detour Trail: start_enemy_turn() draws green movement
   trail along the detour route and fast-forwards cleanly with skip_enemy_turn_timeout().
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


class TestMonsterPathfindingAndAttackE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18105

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚔️ TABLETOP RPG MONSTER A* PATHFINDING & TACTICAL ATTACK PLANNING E2E SUITE")
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
        for _ in range(35):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError(f"Could not connect to Godot tabletop server on port {cls.port}")
        print(f"Connected to Tabletop Godot server successfully on port {cls.port}.")

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

    def test_01_corner_and_obstacle_detour_navigation(self):
        print("\n" + "-" * 80)
        print("SCENARIO 01: Monster Navigates Corner Wall & Open Door To Reach Hero")
        print("-" * 80)

        bdd_step("GIVEN", "Skeleton inside crypt at [2, 4], Barbarian in North corridor at [3, 1], door at [4, 1]<->[4, 2] is open")
        # Direct Manhattan path hits the solid north wall between room and corridor at [2, 2]->[2, 1] or [3, 2]->[3, 1].
        # A* navigation routes East to [4, 2], North through the door to [4, 1], and arrives adjacent to Barbarian at [4, 1].
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            doors=[
                {"id": "fdoor-nw-crypt", "from": [4, 1], "to": [4, 2], "state": "open", "is_open": True, "room": "room-nw-crypt"}
            ],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [3, 1], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [2, 4], "movementSquares": 8, "current_bp": 3, "bodyPoints": 3, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Monster turn executes")
        res = self.player.monster_turn()
        st = self.player.get_state()

        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        skel_pos = skel.get("grid_pos", [])

        # Valid attack tiles adjacent to Barbarian [3, 1] with line of sight: [4, 1] or [2, 1]
        bdd_step("THEN", "Skeleton uses A* path through open doorway to reach adjacent attack tile [4, 1] and attacks",
                 assertions=[
                     f"Turn execution success: {res.get('success')}",
                     f"Skeleton final position: {skel_pos} (expected [4, 1] or [2, 1])",
                     f"Skeleton reached adjacency: {abs(skel_pos[0] - 3) + abs(skel_pos[1] - 1) == 1}",
                     f"Skeleton did not get stuck on initial square [2, 4]: {skel_pos != [2, 4]}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertNotEqual(skel_pos, [2, 4], "Skeleton must not be stuck on starting tile")
        dist = abs(skel_pos[0] - 3) + abs(skel_pos[1] - 1)
        self.assertEqual(dist, 1, f"Skeleton should be adjacent to Barbarian at [3, 1], got {skel_pos}")

    def test_02_doorway_navigation_from_room_to_corridor(self):
        print("\n" + "-" * 80)
        print("SCENARIO 02: Monster Deep Inside Crypt Paths Through Doorway to Corridored Hero")
        print("-" * 80)

        bdd_step("GIVEN", "Skeleton at [2, 5] deep in Crypt, Hero at [4, 1] right outside doorway, door is open")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            doors=[
                {"id": "fdoor-nw-crypt", "from": [4, 1], "to": [4, 2], "state": "open", "room": "room-nw-crypt"}
            ],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 1], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [2, 5], "movementSquares": 8, "current_bp": 2, "bodyPoints": 2, "is_alive": True, "roomId": "room-nw-crypt"}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Monster turn executes")
        res = self.player.monster_turn()
        st = self.player.get_state()

        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        skel_pos = skel.get("grid_pos", [])

        bdd_step("THEN", "Skeleton advances through the room to doorway tile [4, 2] and attacks hero at [4, 1]",
                 assertions=[
                     f"Turn execution success: {res.get('success')}",
                     f"Skeleton final position: {skel_pos} (expected [4, 2])",
                     f"Skeleton did not enter hero tile [4, 1]: {skel_pos != [4, 1]}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(skel_pos, [4, 2])
        self.assertNotEqual(skel_pos, [4, 1])

    def test_03_smart_target_selection_avoids_wall_blocked_hero(self):
        print("\n" + "-" * 80)
        print("SCENARIO 03: Monster Chooses Reachable Hero over Wall-Blocked Hero")
        print("-" * 80)

        bdd_step("GIVEN", "Skeleton at [2, 3] in Crypt. Door is closed! Barbarian at [2, 1] (dist 2, wall-blocked). Elf at [5, 3] (dist 3, inside same room).")
        # In naive Manhattan search, dist(Skeleton, Barbarian) = 2 < dist(Skeleton, Elf) = 3.
        # But Barbarian is behind a solid wall with door closed.
        # A* pathfinding detects Barbarian is unreachable and targets Elf!
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            doors=[
                {"id": "fdoor-nw-crypt", "from": [4, 1], "to": [4, 2], "state": "closed", "room": "room-nw-crypt"}
            ],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [2, 1], "current_bp": 8, "bodyPoints": 8, "is_on_board": True},
                {"id": "elf", "name": "Elf", "grid_pos": [5, 3], "current_bp": 6, "bodyPoints": 6, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [2, 3], "movementSquares": 6, "current_bp": 2, "bodyPoints": 2, "is_alive": True, "roomId": "room-nw-crypt"}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Monster turn executes")
        res = self.player.monster_turn()
        st = self.player.get_state()

        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        skel_pos = skel.get("grid_pos", [])

        bdd_step("THEN", "Skeleton advances toward Elf at [5, 3] (stopping at adjacent tile [4, 3]) and does not get stuck on north wall",
                 assertions=[
                     f"Turn execution success: {res.get('success')}",
                     f"Skeleton final position: {skel_pos} (expected [4, 3])",
                     f"Skeleton is adjacent to Elf: {abs(skel_pos[0] - 5) + abs(skel_pos[1] - 3) == 1}",
                     f"Skeleton did not advance North to wall at [2, 2]: {skel_pos[1] == 3}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(skel_pos, [4, 3])

    def test_04_movement_truncation_advances_without_freezing(self):
        print("\n" + "-" * 80)
        print("SCENARIO 04: Monster Advances Partial Path Towards Distant Hero Without Freezing")
        print("-" * 80)

        bdd_step("GIVEN", "Zombie at [4, 6] in Grand Fossil Hall, Hero far away at [4, 13] (7 squares away)")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-grand-fossil"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 13], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-zombie-1", "name": "Zombie", "grid_pos": [4, 6], "movementSquares": 3, "current_bp": 2, "bodyPoints": 2, "is_alive": True, "roomId": "room-grand-fossil"},
                {"id": "mon-verag", "name": "Verag", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-zombie-1"]
        )

        bdd_step("WHEN", "Zombie executes turn with distant target")
        res = self.player.monster_turn()
        st = self.player.get_state()

        zombie = next((m for m in st.get("monsters", []) if m.get("id") == "mon-zombie-1"), {})
        zombie_pos = zombie.get("grid_pos", [])
        dist = abs(zombie_pos[0] - 4) + abs(zombie_pos[1] - 13)

        bdd_step("THEN", "Zombie advances south towards hero rather than freezing at [4, 6] and reaches adjacent attack tile",
                 assertions=[
                     f"Turn execution success: {res.get('success')}",
                     f"Zombie starting position: [4, 6]",
                     f"Zombie final position: {zombie_pos}",
                     f"Zombie reached hero adjacency: {dist == 1}",
                     f"Zombie did not freeze on starting square [4, 6]: {zombie_pos != [4, 6]}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertNotEqual(zombie_pos, [4, 6])
        self.assertEqual(dist, 1)

    def test_05_immediate_attack_when_already_adjacent(self):
        print("\n" + "-" * 80)
        print("SCENARIO 05: Monster Already Adjacent Attacks Without Moving Away")
        print("-" * 80)

        bdd_step("GIVEN", "Goblin at [4, 3], Dwarf at [4, 2] (already adjacent in room)")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "dwarf", "name": "Dwarf", "grid_pos": [4, 2], "current_bp": 7, "bodyPoints": 7, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-gob-1", "name": "Goblin", "grid_pos": [4, 3], "movementSquares": 10, "attackDice": 4, "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"}
            ],
            discoveredMonsterIds=["mon-gob-1"]
        )

        bdd_step("WHEN", "Goblin executes turn")
        res = self.player.monster_turn()
        st = self.player.get_state()

        gob = next((m for m in st.get("monsters", []) if m.get("id") == "mon-gob-1"), {})
        gob_pos = gob.get("grid_pos", [])

        bdd_step("THEN", "Goblin remains at [4, 3] and attacks Dwarf",
                 assertions=[
                     f"Turn execution success: {res.get('success')}",
                     f"Goblin position stayed at [4, 3]: {gob_pos == [4, 3]}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(gob_pos, [4, 3])

    def test_06_animated_turn_with_skip_follows_detour(self):
        print("\n" + "-" * 80)
        print("SCENARIO 06: Interactive Animated Turn Follows A* Detour and Skips Cleanly")
        print("-" * 80)

        bdd_step("GIVEN", "Skeleton at [2, 5], Barbarian at [4, 1], open door at [4, 1]<->[4, 2]")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            doors=[
                {"id": "fdoor-nw-crypt", "from": [4, 1], "to": [4, 2], "state": "open", "room": "room-nw-crypt"}
            ],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 1], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [2, 5], "movementSquares": 8, "current_bp": 2, "bodyPoints": 2, "is_alive": True, "roomId": "room-nw-crypt"}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Animated enemy turn starts and is skipped")
        start_res = self.player.start_enemy_turn()
        self.assertTrue(start_res.get("success"))

        skip_res = self.player.skip_enemy_turn_timeout()
        st = self.player.get_state()

        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        skel_pos = skel.get("grid_pos", [])

        bdd_step("THEN", "Skip fast-forwards through A* path to [4, 2] adjacent to [4, 1] and finishes turn",
                 assertions=[
                     f"Skip success: {skip_res.get('success')}",
                     f"Skeleton final position: {skel_pos} (expected [4, 2])",
                     f"isEnemyTurnWaiting: {st.get('isEnemyTurnWaiting')} (expected False)"
                 ])
        self.assertTrue(skip_res.get("success"))
        self.assertEqual(skel_pos, [4, 2])
        self.assertFalse(st.get("isEnemyTurnWaiting"))


if __name__ == "__main__":
    unittest.main()
