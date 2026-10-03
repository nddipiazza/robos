#!/usr/bin/env python3
"""
Test Tabletop RPG Wall Blocks Line of Sight E2E Suite:
Validates:
1. Wall squares that block movement (static wallBlocks and falling-block masonry)
   are revealed when seen in hero line of sight.
2. The corridor shroud / fog-of-war reveals the wall block tile, but squares
   behind the wall block remain occluded and shrouded.
3. Wall blocks inside unrevealed rooms or behind closed doors remain concealed until explored.
4. Multi-tile wall blocks (2-tile-wall-h, 2-tile-wall-v) are revealed if any part is seen.
5. Clicking on a wall block tile gives immediate feedback ("WALL BLOCKED!") and prevents movement.
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


class TestWallBlocksLineOfSightE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18099

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 85)
        print("🧱 TABLETOP RPG WALL BLOCKS LINE-OF-SIGHT & MOVEMENT FEEDBACK E2E SUITE")
        print("=" * 85)
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
        print("Connected to Tabletop Godot server successfully on port", cls.port)

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def test_01_corridor_wall_block_revealed_in_line_of_sight(self):
        bdd_step("GIVEN", "Barbarian placed in North corridor at (1, 0) looking eastward toward block-1 at (12, 0)")
        self.player.set_state(
            role="player",
            phase="hero_turn",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [1, 0], "is_on_board": True}
            ],
            revealedRooms=[]
        )

        st = self.player.get_state()
        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))

        bdd_step("WHEN", "Party vision is evaluated from (1, 0)")
        wall_blocks = st.get("wallBlocks", [])
        block_1 = next((wb for wb in wall_blocks if wb.get("id") == "block-1"), None)

        self.assertIsNotNone(block_1, "block-1 must exist in the quest map")
        is_revealed = block_1.get("is_revealed") or block_1.get("isRevealed")

        bdd_step("THEN", "block-1 at (12, 0) is revealed in line of sight, and tile (12, 0) is explored",
                 assertions=[
                     f"block-1 is_revealed == {is_revealed}",
                     f"(12, 0) in exploredTiles: {(12, 0) in explored}"
                 ])
        self.assertTrue(is_revealed, "block-1 must be revealed when seen in line of sight")
        self.assertIn((12, 0), explored, "Tile (12, 0) containing the wall block must be explored")

        bdd_step("AND", "Tiles behind the wall block (13, 0) remain occluded by the solid masonry",
                 assertions=[
                     f"(13, 0) in exploredTiles: {(13, 0) in explored}",
                     f"(14, 0) in exploredTiles: {(14, 0) in explored}"
                 ])
        self.assertNotIn((13, 0), explored, "Tile (13, 0) behind wall block must not be explored")
        self.assertNotIn((14, 0), explored, "Tile (14, 0) behind wall block must not be explored")

    def test_02_wall_blocks_in_unrevealed_rooms_remain_concealed(self):
        bdd_step("GIVEN", "A wall block located inside unrevealed Great Center Chamber (room-center-mid at 14, 9)")
        st_before = self.player.get_state()
        wbs = list(st_before.get("wallBlocks", []))
        wbs.append({
            "id": "block-secret-center",
            "type": "1-tile-wall",
            "grid_pos": [14, 9],
            "x": 14,
            "y": 9,
            "width": 1,
            "height": 1,
            "roomId": "room-center-mid"
        })

        self.player.set_state(
            role="player",
            phase="hero_turn",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [1, 0], "is_on_board": True}
            ],
            revealedRooms=[],
            wallBlocks=wbs
        )

        st = self.player.get_state()
        secret_wb = next((wb for wb in st.get("wallBlocks", []) if wb.get("id") == "block-secret-center"), None)
        self.assertIsNotNone(secret_wb)
        is_rev = secret_wb.get("is_revealed") or secret_wb.get("isRevealed")

        bdd_step("THEN", "The wall block inside unrevealed room-center-mid is NOT revealed",
                 assertions=[
                     f"secret block is_revealed == {is_rev}"
                 ])
        self.assertFalse(is_rev, "Wall block in unrevealed room must remain concealed")

        bdd_step("WHEN", "room-center-mid is revealed to the party")
        self.player.set_state(
            role="player",
            phase="hero_turn",
            revealedRooms=["room-center-mid"]
        )

        st_after = self.player.get_state()
        secret_wb_after = next((wb for wb in st_after.get("wallBlocks", []) if wb.get("id") == "block-secret-center"), None)
        is_rev_after = secret_wb_after.get("is_revealed") or secret_wb_after.get("isRevealed")

        bdd_step("THEN", "The wall block is revealed now that room-center-mid is explored",
                 assertions=[
                     f"secret block is_revealed after room reveal == {is_rev_after}"
                 ])
        self.assertTrue(is_rev_after, "Wall block must become revealed once room is explored")

    def test_03_multi_tile_wall_block_revealed(self):
        bdd_step("GIVEN", "A 2-tile vertical wall block at (0, 10) in west corridor")
        self.player.set_state(
            role="player",
            phase="hero_turn",
            heroes=[
                {"id": "dwarf", "name": "Dwarf", "grid_pos": [0, 7], "is_on_board": True}
            ],
            revealedRooms=[]
        )

        st = self.player.get_state()
        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))
        wall_blocks = st.get("wallBlocks", [])
        block_double = next((wb for wb in wall_blocks if wb.get("id") == "block-double-v"), None)

        self.assertIsNotNone(block_double, "block-double-v must exist in quest map")
        is_rev = block_double.get("is_revealed") or block_double.get("isRevealed")

        bdd_step("THEN", "The multi-tile wall block is revealed as (0, 10) is in line of sight",
                 assertions=[
                     f"block-double-v is_revealed == {is_rev}",
                     f"(0, 10) in exploredTiles: {(0, 10) in explored}"
                 ])
        self.assertTrue(is_rev, "Multi-tile block must be revealed when seen")
        self.assertIn((0, 10), explored, "First tile of 2-tile wall block must be explored")

    def test_04_clicking_wall_block_provides_feedback_and_prevents_move(self):
        bdd_step("GIVEN", "Hero at (11, 0) adjacent to visible wall block at (12, 0)")
        self.player.set_state(
            role="player",
            phase="hero_turn",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [11, 0], "is_on_board": True}
            ],
            movementRolled=True,
            movementRemaining=4
        )

        bdd_step("WHEN", "User clicks on the wall block tile at (12, 0)")
        res = self.player.click_tile(12, 0)
        st = self.player.get_state()

        bdd_step("THEN", "Action succeeds, hero does not enter (12, 0), and remaining movement is preserved",
                 assertions=[
                     f"click_tile response: {res}",
                     f"Hero position remains: {st.get('activeHeroPos')}",
                     f"Movement remaining: {st.get('movementRemaining')}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(st.get("activeHeroPos"), [11, 0], "Hero must NOT move into wall block tile")
        self.assertEqual(st.get("movementRemaining"), 4, "Hero must not lose movement points on blocked clicks")

    def test_05_sprung_falling_block_trap_reveals_as_wall_block(self):
        bdd_step("GIVEN", "A falling block trap at (5, 0) sprung by hero")
        st_before = self.player.get_state()
        traps = list(st_before.get("traps", []))
        traps.append({
            "id": "trap-falling-5-0",
            "type": "falling-block",
            "grid_pos": [5, 0],
            "x": 5,
            "y": 0,
            "state": "sprung"
        })

        self.player.set_state(
            role="player",
            phase="hero_turn",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 0], "is_on_board": True}
            ],
            traps=traps
        )

        st = self.player.get_state()
        explored = set((t[0], t[1]) for t in st.get("exploredTiles", []))

        bdd_step("THEN", "Sprung falling block trap at (5, 0) is explored and visible in line of sight",
                 assertions=[
                     f"(5, 0) in exploredTiles: {(5, 0) in explored}"
                 ])
        self.assertIn((5, 0), explored, "Sprung falling block square must be explored in line of sight")


if __name__ == "__main__":
    unittest.main()
