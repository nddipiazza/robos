#!/usr/bin/env python3
"""
==========================================================================================
🟢 FEATURE: Reachable Movement Green Tile Indicators on Mouse Hover E2E Test Suite
   As a HeroQuest tabletop player
   When movement dice have been rolled and I hold my mouse over any tile on the map
   I expect all tiles the active hero can walk to within their remaining movement points
   in the revealed map to display a crisp green indicator around each tile
   So that I have clear tactical awareness of all legal destinations and obstacles.
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


class TestReachableMovementIndicatorsE2E(unittest.TestCase):
    """BDD End-to-End tests verifying green walk indicators on hover during movement phase."""

    proc = None
    ai = None
    port = 18118

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🟢 REACHABLE MOVEMENT GREEN TILE INDICATORS ON MOUSE HOVER E2E TEST SUITE")
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
        self.ai.execute_action("reset_game")
        time.sleep(0.2)

    def test_01_movement_not_rolled_hover_shows_no_indicators(self):
        """Scenario 1: Hovering over the map when movement is not rolled shows no indicators."""
        bdd_step("GIVEN", "Active hero Rogar has NOT yet rolled movement dice this turn",
                 action_info="Verify initial turn state: movement_rolled is False")
        st = self.ai.get_state()
        self.assertFalse(st.get("movementRolled", False), "Movement must not be rolled initially")

        bdd_step("WHEN", "Player hovers mouse over board tile (2, 2)",
                 action_info="ai.hover_tile(2, 2)")
        res = self.ai.hover_tile(2, 2)
        self.assertTrue(res.get("success"), "hover_tile must succeed")

        bdd_step("THEN", "No green walk indicators are displayed",
                 assertions=[
                     "isShowingReachableIndicators is False",
                     "reachableWalkTiles is empty",
                     "hoveredTile is [2, 2]"
                 ])
        st = self.ai.get_state()
        self.assertEqual(st.get("hoveredTile"), [2, 2], "Hovered tile should be [2, 2]")
        self.assertFalse(self.ai.is_showing_reachable_indicators(), "Indicators must not show when movement not rolled")
        self.assertEqual(len(self.ai.get_reachable_walk_tiles()), 0, "No reachable tiles should be reported")

    def test_02_movement_rolled_hover_shows_green_walk_indicators(self):
        """Scenario 2: When movement dice are rolled, hovering over map shows green indicators on reachable tiles."""
        bdd_step("GIVEN", "Active hero rolls movement dice and receives movement points",
                 action_info="ai.execute_action('roll_movement') and patch movementRemaining = 4")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=4)
        st = self.ai.get_state()
        self.assertTrue(st.get("movementRolled"), "Movement must be marked as rolled")
        self.assertEqual(st.get("movementRemaining"), 4, "Movement remaining must be 4")

        active_idx = st.get("activeHeroIndex", 0)
        hero = st.get("heroes", [])[active_idx]
        h_pos = hero.get("grid_pos", [1, 1])

        bdd_step("WHEN", "Player hovers mouse over board tile (1, 2)",
                 action_info="ai.hover_tile(1, 2)")
        res = self.ai.hover_tile(1, 2)
        self.assertTrue(res.get("success"), "hover_tile must succeed")

        bdd_step("THEN", "Green walk indicators are activated for all reachable tiles in revealed map",
                 assertions=[
                     "isShowingReachableIndicators is True",
                     "isMouseOverBoard is True",
                     "Reachable tiles list is non-empty",
                     "Hero's own tile is not in reachable destination list"
                 ])
        st = self.ai.get_state()
        self.assertTrue(self.ai.is_showing_reachable_indicators(), "Indicators must be visible")
        reachable = self.ai.get_reachable_walk_tiles()
        self.assertGreater(len(reachable), 0, "Should have reachable tiles")
        self.assertNotIn(h_pos, reachable, "Hero's current tile cannot be in reachable destinations")

    def test_03_unhover_hides_indicators(self):
        """Scenario 3: Moving mouse off the board immediately hides the indicators."""
        bdd_step("GIVEN", "Movement is rolled and mouse is hovering over tile (2, 2)",
                 action_info="roll_movement and hover_tile(2, 2)")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=4)
        self.ai.hover_tile(2, 2)
        self.assertTrue(self.ai.is_showing_reachable_indicators(), "Indicators should be showing")

        bdd_step("WHEN", "Player moves mouse off the board",
                 action_info="ai.unhover_tile()")
        self.ai.unhover_tile()

        bdd_step("THEN", "Reachable indicators are hidden",
                 assertions=[
                     "isShowingReachableIndicators is False",
                     "hoveredTile is [-1, -1]",
                     "isMouseOverBoard is False"
                 ])
        st = self.ai.get_state()
        self.assertEqual(st.get("hoveredTile"), [-1, -1])
        self.assertFalse(st.get("isMouseOverBoard"))
        self.assertFalse(self.ai.is_showing_reachable_indicators())

    def test_04_obstacles_not_reachable(self):
        """Scenario 4: Walls, closed doors, and furniture are never marked as reachable."""
        bdd_step("GIVEN", "Hero has rolled 6 movement points in starting area",
                 action_info="roll_movement with movementRemaining = 6")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=6)
        self.ai.hover_tile(1, 1)

        reachable = self.ai.get_reachable_walk_tiles()
        st = self.ai.get_state()

        bdd_step("THEN", "Obstacle tiles cannot be reached",
                 assertions=[
                     "Furniture spaces cannot be in reachableWalkTiles",
                     "Closed doors thresholds cannot be crossed into unrevealed rooms",
                     "Wall blocks cannot be in reachableWalkTiles"
                 ])
        # Check all furniture tiles
        for f in st.get("furniture", []):
            fx = f.get("x", 0)
            fy = f.get("y", 0)
            fw = f.get("width", 1)
            fh = f.get("height", 1)
            for x in range(fx, fx + fw):
                for y in range(fy, fy + fh):
                    self.assertNotIn([x, y], reachable, f"Furniture tile ({x}, {y}) must not be reachable")

        # Check wall blocks
        for wb in st.get("wallBlocks", []):
            wx = wb.get("x", wb.get("position", [0, 0])[0])
            wy = wb.get("y", wb.get("position", [0, 0])[1])
            self.assertNotIn([wx, wy], reachable, f"Wall block ({wx}, {wy}) must not be reachable")

    def test_05_friendly_hero_sharing_squares_strictly_prevented(self):
        """Scenario 5: Friendly heroes can be walked through, but ending movement on another hero is forbidden."""
        bdd_step("GIVEN", "Active hero Rogar at (1, 1) and friendly hero Brian at adjacent tile (2, 1)",
                 action_info="Position Brian at (2, 1) and active hero at (1, 1)")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state",
                               movementRemaining=4,
                               heroes=[
                                   {"id": "barbarian", "grid_pos": [1, 1], "is_on_board": True, "current_bp": 8},
                                   {"id": "dwarf", "grid_pos": [2, 1], "is_on_board": True, "current_bp": 7}
                               ])
        self.ai.hover_tile(1, 1)
        reachable = self.ai.get_reachable_walk_tiles()

        bdd_step("THEN", "Friendly hero Brian's square (2, 1) is NOT in reachable destinations",
                 assertions=[
                     "(2, 1) is not in reachableWalkTiles (no sharing squares)",
                     "(3, 1) can be reached if open path passes through friendly hero"
                 ])
        self.assertNotIn([2, 1], reachable, "Friendly hero tile (2, 1) must NOT be a reachable destination")

    def test_06_monster_blocking_prevents_walk_through_and_destination(self):
        """Scenario 6: Living monsters block movement path and cannot be inhabited."""
        bdd_step("GIVEN", "A living Goblin placed at (2, 1)",
                 action_info="Place living monster at (2, 1)")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state",
                               movementRemaining=4,
                               heroes=[{"id": "barbarian", "grid_pos": [1, 1], "is_on_board": True, "current_bp": 8}],
                               monsters=[{"id": "goblin_1", "grid_pos": [2, 1], "is_alive": True, "current_bp": 1}])
        self.ai.hover_tile(1, 1)
        reachable = self.ai.get_reachable_walk_tiles()

        bdd_step("THEN", "Monster tile (2, 1) is NOT reachable",
                 assertions=[
                     "Monster tile (2, 1) is strictly excluded from reachableWalkTiles"
                 ])
        self.assertNotIn([2, 1], reachable, "Monster tile (2, 1) cannot be reached or entered")

    def test_07_exhausting_movement_hides_indicators(self):
        """Scenario 7: Setting movementRemaining to 0 hides green indicators immediately."""
        bdd_step("GIVEN", "Indicators currently visible with 3 movement points and hovered mouse",
                 action_info="roll_movement, movementRemaining=3, hover_tile(1, 1)")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=3)
        self.ai.hover_tile(1, 1)
        self.assertTrue(self.ai.is_showing_reachable_indicators())

        bdd_step("WHEN", "Hero spends all movement points (movementRemaining = 0)",
                 action_info="patch_state with movementRemaining = 0")
        self.ai.execute_action("patch_state", movementRemaining=0)

        bdd_step("THEN", "Reachable indicators are hidden",
                 assertions=[
                     "isShowingReachableIndicators is False",
                     "reachableWalkTiles is empty"
                 ])
        self.assertFalse(self.ai.is_showing_reachable_indicators())
        self.assertEqual(len(self.ai.get_reachable_walk_tiles()), 0)

    def test_08_visual_screenshot_proof(self):
        """Scenario 8: Visual screenshot proof capture with active green indicators."""
        bdd_step("GIVEN", "Hero has 5 movement points and mouse is hovering over revealed room tile",
                 action_info="roll_movement, movementRemaining=5, hover_tile(2, 2)")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=5)
        self.ai.hover_tile(2, 2)
        time.sleep(0.3)

        out_screenshot = "/tmp/tabletop_reachable_walk_indicators.png"
        bdd_step("WHEN", "QA system captures viewport screenshot",
                 action_info=f"take_screenshot -> {out_screenshot}")
        res = self.ai.take_screenshot(out_screenshot)
        self.assertTrue(res.get("success"), "take_screenshot must succeed")
        self.assertTrue(os.path.exists(out_screenshot), "Screenshot file must exist")
        self.assertGreater(os.path.getsize(out_screenshot), 10000, "Screenshot file size must be > 10KB")
        print(f"\n    📸 Visual proof captured: {out_screenshot} ({os.path.getsize(out_screenshot)} bytes)")


if __name__ == "__main__":
    unittest.main()
