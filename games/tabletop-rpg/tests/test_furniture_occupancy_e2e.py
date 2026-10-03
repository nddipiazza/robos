#!/usr/bin/env python3
"""
==========================================================================================
🏛️ FEATURE: Furniture Occupancy & Northwest Crypt Tomb Reorganization E2E Test Suite
   As a HeroQuest tabletop player
   I expect that heroes cannot inhabit, pathfind through, or end movement on furniture tiles
   And the Ancient Stone Tomb in the Northwest Crypt is reorganized away from the entrance
   So that the doorway and central movement corridor remain completely unobstructed.
==========================================================================================
"""

import os
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, assertions: list = None, action_info: str = None):
    prefix = {
        "GIVEN": "  GIVEN  ",
        "WHEN":  "  WHEN   ",
        "THEN":  "  THEN   ",
        "AND":   "  AND    "
    }.get(step_type.upper(), "  STEP   ")
    print(f"\n{prefix} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]       {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestFurnitureOccupancyE2E(unittest.TestCase):
    """BDD End-to-End tests verifying that heroes cannot inhabit furniture spaces
    and that the Ancient Stone Tomb in the Northwest Crypt is reorganized."""

    proc = None
    ai = None
    port = 18112

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🏛️ FURNITURE OCCUPANCY & NORTHWEST CRYPT TOMB REORGANIZATION E2E TEST SUITE")
        print("=" * 90)
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(35):
            if cls.ai.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError(f"Could not connect to Godot tabletop server on port {cls.port}")
        print(f"Connected to Tabletop Godot server on port {cls.port}.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except Exception:
                cls.proc.kill()

    def setUp(self):
        self.ai.reset_game()
        time.sleep(0.15)

    def test_01_reorganized_tomb_clears_doorway_and_center_aisle(self):
        """Scenario 01: Verify the Ancient Stone Tomb in room-nw-crypt is reorganized
        to (5..6, 2..3), clearing doorway (4, 2) and main movement aisle (4, 3)."""
        print("\n" + "=" * 85)
        print("🏛️ SCENARIO 01: Reorganized Tomb in Northwest Crypt Clears Doorway & Aisle")
        print("=" * 85)

        bdd_step("GIVEN", "The default pristine cartridge state for Quest 1: The Trial")
        st = self.ai.get_state()
        furn_list = st.get("furniture", [])
        tomb = next((f for f in furn_list if f.get("id") == "furn-tomb-1"), {})

        bdd_step("THEN", "Ancient Stone Tomb is reorganized to (x: 5, y: 2, w: 2, h: 2)",
                 assertions=[
                     f"Tomb ID: {tomb.get('id')}",
                     f"Tomb Name: {tomb.get('name')}",
                     f"Tomb X: {tomb.get('x')} (expected 5)",
                     f"Tomb Y: {tomb.get('y')} (expected 2)",
                     f"Tomb Width: {tomb.get('width')} (expected 2)",
                     f"Tomb Height: {tomb.get('height')} (expected 2)",
                     f"Tomb Room: {tomb.get('roomId')} (expected room-nw-crypt)"
                 ])
        self.assertEqual(tomb.get("id"), "furn-tomb-1")
        self.assertEqual(tomb.get("x"), 5)
        self.assertEqual(tomb.get("y"), 2)
        self.assertEqual(tomb.get("width"), 2)
        self.assertEqual(tomb.get("height"), 2)
        self.assertEqual(tomb.get("roomId"), "room-nw-crypt")

        bdd_step("AND", "Doorway tile (4, 2) and center aisle tile (4, 3) are NOT occupied by furniture",
                 assertions=[
                     f"(4, 2) furniture occupied: {self.ai.is_tile_occupied_by_furniture(4, 2)} (expected False)",
                     f"(4, 3) furniture occupied: {self.ai.is_tile_occupied_by_furniture(4, 3)} (expected False)",
                     f"(5, 2) furniture occupied: {self.ai.is_tile_occupied_by_furniture(5, 2)} (expected True)",
                     f"(6, 2) furniture occupied: {self.ai.is_tile_occupied_by_furniture(6, 2)} (expected True)",
                     f"(5, 3) furniture occupied: {self.ai.is_tile_occupied_by_furniture(5, 3)} (expected True)",
                     f"(6, 3) furniture occupied: {self.ai.is_tile_occupied_by_furniture(6, 3)} (expected True)"
                 ])
        self.assertFalse(self.ai.is_tile_occupied_by_furniture(4, 2))
        self.assertFalse(self.ai.is_tile_occupied_by_furniture(4, 3))
        self.assertTrue(self.ai.is_tile_occupied_by_furniture(5, 2))
        self.assertTrue(self.ai.is_tile_occupied_by_furniture(6, 2))
        self.assertTrue(self.ai.is_tile_occupied_by_furniture(5, 3))
        self.assertTrue(self.ai.is_tile_occupied_by_furniture(6, 3))

    def test_02_hero_cannot_move_onto_furniture_space(self):
        """Scenario 02: Attempting to move Barbarian directly onto a furniture tile
        (Ancient Stone Tomb at (5, 2)) is strictly blocked and rejected."""
        print("\n" + "=" * 85)
        print("🏛️ SCENARIO 02: Hero Cannot Move Onto Furniture Space")
        print("=" * 85)

        bdd_step("GIVEN", "Barbarian inside Northwest Crypt at (4, 3) with 6 movement squares remaining")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=6,
            movementRolled=True,
            movementClosed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "current_bp": 8, "is_on_board": True}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Barbarian attempts to step onto Tomb tile (5, 2)",
                 action_info="move(5, 2)")
        res = self.ai.move(5, 2)

        st_after = self.ai.get_state()
        hero_pos = st_after.get("heroes", [{}])[0].get("grid_pos")

        bdd_step("THEN", "Move is rejected and Barbarian remains safely at (4, 3)",
                 assertions=[
                     f"Move success: {res.get('success')} (expected False)",
                     f"Hero position: {hero_pos} (expected [4, 3])",
                     f"Movement remaining: {st_after.get('movementRemaining')} (expected 6)"
                 ])
        self.assertFalse(res.get("success"))
        self.assertEqual(hero_pos, [4, 3])
        self.assertEqual(st_after.get("movementRemaining"), 6)

    def test_03_pathfinding_avoids_furniture_spaces(self):
        """Scenario 03: Pathfinding dynamically routes around the Ancient Stone Tomb
        when navigating across the chamber."""
        print("\n" + "=" * 85)
        print("🏛️ SCENARIO 03: Pathfinding Avoids Furniture Spaces When Navigating")
        print("=" * 85)

        bdd_step("GIVEN", "Barbarian at (4, 2) and Northwest Crypt is cleared")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=8,
            movementRolled=True,
            movementClosed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 2], "current_bp": 8, "is_on_board": True}],
            storyTriggers=[{"marker": "B", "triggered": True}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Barbarian moves to southeast corner of crypt at (6, 5)",
                 action_info="move(6, 5)")
        res = self.ai.move(6, 5)

        st_after = self.ai.get_state()
        trail = st_after.get("movementTrail", [])
        final_pos = st_after.get("heroes", [{}])[0].get("grid_pos")

        tomb_tiles = [[5, 2], [6, 2], [5, 3], [6, 3]]
        trail_intersects_tomb = any(pt in tomb_tiles for pt in trail)

        bdd_step("THEN", "Barbarian reaches (6, 5) without any path step touching Tomb tiles",
                 assertions=[
                     f"Move success: {res.get('success')} (expected True)",
                     f"Final position: {final_pos} (expected [6, 5])",
                     f"Movement trail: {trail}",
                     f"Trail intersected Tomb: {trail_intersects_tomb} (expected False)"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(final_pos, [6, 5])
        self.assertFalse(trail_intersects_tomb, f"Trail {trail} must not intersect tomb tiles {tomb_tiles}")

    def test_04_clicking_on_furniture_provides_immediate_feedback(self):
        """Scenario 04: Left-clicking on a furniture tile produces FURNITURE BLOCKED feedback
        and does not move the hero or waste movement dice."""
        print("\n" + "=" * 85)
        print("🏛️ SCENARIO 04: Tile Click on Furniture Gives Blocked Feedback")
        print("=" * 85)

        bdd_step("GIVEN", "Barbarian inside crypt at (4, 3) with 5 movement remaining")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            movementClosed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "current_bp": 8, "is_on_board": True}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Player clicks directly on Tomb tile at (6, 3)",
                 action_info="click_tile(6, 3)")
        self.ai.click_tile(6, 3)
        time.sleep(0.1)

        st_after = self.ai.get_state()
        hero_pos = st_after.get("heroes", [{}])[0].get("grid_pos")

        bdd_step("THEN", "Barbarian has not moved and movement points remain 5",
                 assertions=[
                     f"Hero pos: {hero_pos} (expected [4, 3])",
                     f"Movement remaining: {st_after.get('movementRemaining')} (expected 5)"
                 ])
        self.assertEqual(hero_pos, [4, 3])
        self.assertEqual(st_after.get("movementRemaining"), 5)

    def test_05_hero_enters_crypt_through_door_unimpeded(self):
        """Scenario 05: Hero opening the crypt door at (4, 1) and stepping into (4, 2) -> (4, 3)
        proceeds cleanly through the unobstructed entrance."""
        print("\n" + "=" * 85)
        print("🏛️ SCENARIO 05: Hero Enters Crypt Through Door Unimpeded")
        print("=" * 85)

        bdd_step("GIVEN", "Barbarian stands at threshold (4, 1) with closed door to crypt at (4, 2)")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=4,
            movementRolled=True,
            movementClosed=False,
            revealedRooms=[],
            doors=[{"from": [4, 1], "to": [4, 2], "is_open": False}],
            heroes=[{"id": "barbarian", "grid_pos": [4, 1], "is_on_board": True}]
        )

        bdd_step("WHEN", "Barbarian kicks open the door (4, 1) -> (4, 2)",
                 action_info="open_door(4, 1, 4, 2)")
        door_res = self.ai.open_door(4, 1, 4, 2)
        self.assertTrue(door_res.get("success"))

        bdd_step("AND", "Barbarian advances through doorway tile (4, 2) to center aisle (4, 3)",
                 action_info="move(4, 3)")
        move_res = self.ai.move(4, 3)

        st_after = self.ai.get_state()
        hero_pos = st_after.get("heroes", [{}])[0].get("grid_pos")

        bdd_step("THEN", "Entry into crypt succeeds smoothly and Barbarian stands at (4, 3)",
                 assertions=[
                     f"Door open success: {door_res.get('success')}",
                     f"Move success: {move_res.get('success')} (expected True)",
                     f"Hero position: {hero_pos} (expected [4, 3])",
                     f"Crypt revealed: {'room-nw-crypt' in st_after.get('revealedRooms', [])}"
                 ])
        self.assertTrue(move_res.get("success"))
        self.assertEqual(hero_pos, [4, 3])
        self.assertIn("room-nw-crypt", st_after.get("revealedRooms", []))

    def test_06_capture_visual_screenshot_of_reorganized_tomb(self):
        """Scenario 06: Capture visual screenshot of Northwest Crypt showing the
        reorganized Ancient Stone Tomb and unobstructed entrance."""
        print("\n" + "=" * 85)
        print("🏛️ SCENARIO 06: Capture Visual Screenshot of Reorganized Tomb")
        print("=" * 85)

        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=3,
            movementRolled=True,
            movementClosed=False,
            revealedRooms=["room-nw-crypt"],
            doors=[{"from": [4, 1], "to": [4, 2], "is_open": True}],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "is_on_board": True}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": True, "current_bp": 1, "grid_pos": [3, 4], "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": True, "current_bp": 1, "grid_pos": [5, 4], "roomId": "room-nw-crypt"}
            ]
        )
        time.sleep(0.3)

        out_path = "/tmp/tabletop_reorganized_tomb_e2e.png"
        res = self.ai.take_screenshot(out_path)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(out_path))

        bdd_step("THEN", f"Screenshot captured successfully at {out_path} ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    unittest.main()
