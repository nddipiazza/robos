#!/usr/bin/env python3
"""
test_fog_of_war_scenarios.py
Isolated E2E test suite verifying authentic HeroQuest Fog of War scenarios,
line-of-sight raycasting, and token positioning in Godot Tabletop RPG.
"""

import os
import sys
import time
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


class TestFogOfWarScenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18097
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(25):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()

    def test_01_active_hero_token_centering(self):
        """Active hero token must be centered on the tile with 0px quadrant offset."""
        st = self.player.get_state()
        pos = st.get("activeHeroPos", [1, 1])
        token_pos = st.get("activeHeroTokenPos")
        offset = st.get("boardOffset", [0, 0])
        tile_size = st.get("tileSize", 42.0)

        expected_x = offset[0] + (pos[0] + 0.5) * tile_size
        expected_y = offset[1] + (pos[1] + 0.5) * tile_size

        self.assertIsNotNone(token_pos, "activeHeroTokenPos must be present in telemetry")
        self.assertAlmostEqual(token_pos[0], expected_x, delta=0.5,
                               msg=f"Token X ({token_pos[0]}) must equal expected tile center X ({expected_x})")
        self.assertAlmostEqual(token_pos[1], expected_y, delta=0.5,
                               msg=f"Token Y ({token_pos[1]}) must equal expected tile center Y ({expected_y})")

        # Verify Standard HeroQuest Rule: Initially heroes do not show up until their first turn
        heroes = st.get("heroes", [])
        on_board_heroes = [h for h in heroes if h.get("is_on_board")]
        self.assertEqual(len(on_board_heroes), 1, "Initially, only the active starting hero is on the board")
        self.assertEqual(on_board_heroes[0].get("id"), "barbarian")
        self.assertEqual(on_board_heroes[0].get("grid_pos"), [1, 1])

        off_board_heroes = [h for h in heroes if not h.get("is_on_board")]
        self.assertEqual(len(off_board_heroes), 3, "Other 3 heroes are off the board until their first turn")

    def test_02_initial_spawn_corridor_los(self):
        """At initial spawn (1, 1), unobstructed corridor tiles are visible; rooms remain shrouded."""
        st = self.player.get_state()
        self.assertEqual(st.get("revealedRooms", []), [], "Initial state must have zero revealed rooms")

        explored = st.get("exploredTiles", [])
        explored_tuples = set((t[0], t[1]) for t in explored)

        # Corridors along row 1 outside crypt should be visible
        for x in [1, 2, 3, 4]:
            self.assertIn((x, 1), explored_tuples, f"Corridor tile ({x}, 1) should be visible")

        # Northwest crypt tiles (x in 2..6, y in 2..5) must NOT be visible
        for rx in range(2, 7):
            for ry in range(2, 6):
                self.assertNotIn((rx, ry), explored_tuples,
                                 f"Crypt tile ({rx}, {ry}) must remain shrouded behind closed doors")

    def test_03_no_diagonal_leak_around_corners(self):
        """Moving to hallway (7, 2) must NOT reveal disconnected random squares like (8, 8)."""
        # Ensure hero reaches (7, 2) even on low random movement rolls
        move_res = {"success": False}
        for _ in range(5):
            self.player.execute_action({"action": "roll_movement"})
            move_res = self.player.move(7, 2)
            if move_res.get("success"):
                break
        self.assertTrue(move_res.get("success"), "Moving to (7, 2) should succeed")

        st = self.player.get_state()
        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))

        # Tile (7, 2) and surrounding column 7 corridor tiles must be visible
        for y in range(0, 6):
            self.assertIn((7, y), explored, f"Column corridor tile (7, {y}) must be visible from (7, 2)")

        # CRITICAL BUG TEST: (8, 8) was the random isolated square reported by user.
        # It MUST NOT be visible from (7, 2)!
        self.assertNotIn((8, 8), explored,
                         "CRITICAL: Tile (8, 8) is around a wall corner and must NOT be revealed from (7, 2)!")

        # Other around-corner tiles in parallel corridor must also remain shrouded
        for y in range(6, 12):
            self.assertNotIn((8, y), explored,
                             f"Parallel corridor tile (8, {y}) must remain shrouded from (7, 2)")

    def test_04_corner_exploration_progression(self):
        """Moving onto the corner tile (7, 5) opens up the perpendicular hallway (8, 5) .. (12, 5)."""
        self.player.execute_action({"action": "roll_movement"})
        move_res = self.player.move(7, 5)
        self.assertTrue(move_res.get("success"), "Moving to corner (7, 5) should succeed")

        st = self.player.get_state()
        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))

        # At corner (7, 5), perpendicular corridor tiles are now visible in direct line of sight
        for x in [8, 9, 10, 11, 12]:
            self.assertIn((x, 5), explored, f"Perpendicular hallway ({x}, 5) should be visible from corner (7, 5)")

    def test_05_closed_door_blocks_vision_into_room(self):
        """Closed door at (4, 1) -> (4, 2) blocks line of sight into the Northwest Crypt."""
        self.player.execute_action({"action": "roll_movement"})
        self.player.move(4, 1)

        st = self.player.get_state()
        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))

        self.assertNotIn("room-nw-crypt", st.get("revealedRooms", []))
        self.assertNotIn((4, 3), explored, "Center of crypt must remain shrouded when door is closed")

    def test_06_kicking_open_door_instant_room_reveal(self):
        """Kicking open the door immediately reveals all 20 tiles of Northwest Crypt and its monsters."""
        open_res = self.player.open_door(4, 1, 4, 2)
        self.assertTrue(open_res.get("success"), "Opening crypt door must succeed")

        st = self.player.get_state()
        self.assertIn("room-nw-crypt", st.get("revealedRooms", []), "Crypt must be registered in revealedRooms")

        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))
        # All 20 tiles (x=2..6, y=2..5) must now be explored
        for rx in range(2, 7):
            for ry in range(2, 6):
                self.assertIn((rx, ry), explored, f"Room tile ({rx}, {ry}) must be revealed after door opened")

        # Crypt monsters must now be visible in state
        monsters = st.get("monsters", [])
        crypt_monsters = [m for m in monsters if m.get("roomId") == "room-nw-crypt"]
        self.assertEqual(len(crypt_monsters), 2, "Both crypt skeletons must be present in room")

    def test_07_pathfinding_cannot_walk_through_walls(self):
        """Movement cannot jump through solid walls into unrevealed chambers or across stone blocks."""
        self.player.execute_action({"action": "roll_movement"})
        # Attempt to move directly across wall into Grand Fossil Hall (which is unrevealed)
        bad_move = self.player.move(4, 8)
        self.assertFalse(bad_move.get("success"), "Moving through solid wall into unrevealed room must fail")

    def test_08_cannot_end_movement_on_monster_square(self):
        """Standard HeroQuest Rule: Heroes cannot end movement on monster-occupied squares."""
        self.player.execute_action({"action": "roll_movement"})
        # Attempt to move directly onto Crypt Skeleton at (5, 4)
        m_move = self.player.move(5, 4)
        self.assertFalse(m_move.get("success"), "Moving directly onto monster square must fail per HeroQuest rules")

    def test_09_hero_enters_board_on_first_turn(self):
        """When a hero's first turn arrives, they descend the spiral stairway and enter the board."""
        # Barbarian concludes turn
        self.player.execute_action({"action": "end_turn"})
        st = self.player.get_state()
        self.assertEqual(st.get("activeHero"), "dwarf", "Turn must advance to Dwarf")

        heroes = st.get("heroes", [])
        dwarf = next(h for h in heroes if h.get("id") == "dwarf")
        self.assertTrue(dwarf.get("is_on_board"), "Dwarf must now be on the board on his first turn")
        self.assertEqual(dwarf.get("grid_pos"), [1, 1], "Dwarf enters at the spiral stairway")


if __name__ == "__main__":
    unittest.main()
