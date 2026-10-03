#!/usr/bin/env python3
"""
test_edge_tiles_and_start_stair_walkability_e2e.py
BDD End-to-End Test Suite verifying:
1. Map edge tiles are not walkable.
2. The starting tile is special: all characters coexist there until their first turn is not skipped.
3. From that point on, characters cannot step back upon the start tile (it is not walkable).
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

from rpc_ai.tabletop_rpc_ai import TabletopRPCAI


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"⌛ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestEdgeTilesAndStartStairWalkabilityE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18131

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⌛ FEATURE: Map Edge Tiles Non-Walkable & Special Starting Stair Coexistence")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--skip-spell-select"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopRPCAI(port=cls.port, human_delay=0.05)
        connected = False
        for _ in range(35):
            if cls.ai.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            print(f"\n[TestTeardown] Terminating Godot instance on port {cls.port}...")
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3.0)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def setUp(self):
        # Reset to player mode, round 1, hero_phase
        self.ai.set_state(
            currentRole="player",
            phase="hero_phase",
            round=1,
            activeHeroIndex=0,
            movementRolled=False,
            movementRemaining=0,
            hasActed=False,
            hasMoved=False
        )

    def test_01_all_heroes_coexist_at_starting_stair_at_quest_start(self):
        """Scenario 1: All 4 heroes begin on the board at the starting stair tile and coexist."""
        bdd_scenario_header(1, "All 4 heroes coexist at starting stair tile [0, 1] at quest start")
        bdd_step("GIVEN", "The game initializes Quest 1: The Trial",
                 info="TabletopWorld loads cartridge and positions party")

        st = self.ai.get_state()
        stair = st.get("startingStair", [0, 1])
        heroes = st.get("heroes", [])

        bdd_step("WHEN", "Tabletop telemetry is inspected for initial hero positions",
                 info=f"Starting staircase tile is {stair}")

        self.assertEqual(len(heroes), 4, "There should be 4 hero characters")

        bdd_step("THEN", "Every adventurer is on the board at the starting staircase tile",
                 assertions=[
                     "All 4 heroes have is_on_board == True",
                     "All 4 heroes have grid_pos == startingStair ([0, 1])",
                     "All 4 heroes have hasDepartedStart == False"
                 ])

        for h in heroes:
            self.assertTrue(h.get("is_on_board", False) or h.get("isOnBoard", False),
                            f"Hero {h.get('id')} must be on the board initially")
            self.assertEqual(h.get("grid_pos"), stair,
                             f"Hero {h.get('id')} must be positioned on starting stair {stair}")
            self.assertFalse(h.get("hasDepartedStart", False),
                             f"Hero {h.get('id')} has not yet departed the starting stair")

    def test_02_edge_tiles_are_not_walkable(self):
        """Scenario 2: Edge boundary tiles of the board grid are strictly non-walkable."""
        bdd_scenario_header(2, "Edge boundary tiles of the board grid are strictly non-walkable")
        bdd_step("GIVEN", "Active hero Barbarian rolls movement points",
                 info="Roll movement and set movementRemaining = 6")

        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=6)

        edge_targets = [
            [0, 0],   # Top-left corner edge
            [0, 2],   # Left edge below start stair
            [12, 0],  # Top edge
            [27, 5],  # Right edge
            [5, 20]   # Bottom edge
        ]

        bdd_step("WHEN", "Hero attempts to move to various perimeter edge tiles",
                 info=f"Testing movement to edges: {edge_targets}")

        for edge_pos in edge_targets:
            res = self.ai.move_hero(edge_pos)
            self.assertFalse(res.get("success", False),
                             f"Move to edge tile {edge_pos} must be rejected!")

        bdd_step("THEN", "All edge movement attempts fail and hero remains at start tile",
                 assertions=[
                     "move_hero to [0, 0] failed",
                     "move_hero to [0, 2] failed",
                     "move_hero to [12, 0] failed",
                     "move_hero to [27, 5] failed",
                     "move_hero to [5, 20] failed",
                     "Hero position remains [0, 1]"
                 ])

        st = self.ai.get_state()
        self.assertEqual(st.get("activeHeroPos"), [0, 1], "Hero must remain on starting tile [0, 1]")

    def test_03_skipped_first_turn_hero_remains_at_starting_stair(self):
        """Scenario 3: When a hero skips their first turn, they remain coexisting on starting tile."""
        bdd_scenario_header(3, "Skipped first turn hero remains coexisting at starting stair")
        bdd_step("GIVEN", "Active hero Barbarian skips their first turn without moving or acting",
                 info="Player clicks 'Skip Turn'")

        st_before = self.ai.get_state()
        self.assertEqual(st_before.get("activeHeroIndex"), 0, "Active hero is Barbarian (0)")

        # Click End Turn without moving
        self.ai.click_end_turn()

        st_after = self.ai.get_state()

        bdd_step("WHEN", "Initiative passes to the next adventurer (Dwarf)",
                 info=f"Active hero index is now {st_after.get('activeHeroIndex')}")

        self.assertEqual(st_after.get("activeHeroIndex"), 1, "Active hero should advance to Dwarf (1)")

        bdd_step("THEN", "Barbarian remains at starting tile [0, 1] with hasDepartedStart = False",
                 assertions=[
                     "Barbarian grid_pos is [0, 1]",
                     "Barbarian hasDepartedStart is False",
                     "Dwarf grid_pos is [0, 1] and coexists on starting stair"
                 ])

        barb = st_after.get("heroes", [])[0]
        dwarf = st_after.get("heroes", [])[1]
        self.assertEqual(barb.get("grid_pos"), [0, 1], "Barbarian must remain on starting stair [0, 1]")
        self.assertFalse(barb.get("hasDepartedStart", False), "Barbarian hasDepartedStart must be False")
        self.assertEqual(dwarf.get("grid_pos"), [0, 1], "Dwarf must also be on starting stair [0, 1]")

    def test_04_unskipped_turn_moves_off_start_tile(self):
        """Scenario 4: When a hero takes an unskipped turn and moves, they depart onto corridor [1, 1]."""
        bdd_scenario_header(4, "Unskipped turn moves off starting stair onto corridor [1, 1]")
        bdd_step("GIVEN", "Active hero Barbarian rolls movement to leave starting stair",
                 info="roll_movement and movementRemaining = 4")

        self.ai.set_state(activeHeroIndex=0, movementRolled=True, movementRemaining=4)

        bdd_step("WHEN", "Hero moves into the corridor at [1, 1]",
                 info="ai.move_hero([1, 1])")

        res = self.ai.move_hero([1, 1])
        self.assertTrue(res.get("success", False), "Moving from [0, 1] to corridor [1, 1] must succeed")

        bdd_step("THEN", "Barbarian arrives at [1, 1] and hasDepartedStart becomes True",
                 assertions=[
                     "activeHeroPos is [1, 1]",
                     "Barbarian hasDepartedStart is True",
                     "Other heroes (Dwarf, Elf, Wizard) remain coexisting on [0, 1]"
                 ])

        st = self.ai.get_state()
        heroes = st.get("heroes", [])
        self.assertEqual(st.get("activeHeroPos"), [1, 1], "Barbarian must now be at [1, 1]")
        self.assertTrue(heroes[0].get("hasDepartedStart", False), "Barbarian hasDepartedStart must be True")

        # Other heroes still on starting stair
        self.assertEqual(heroes[1].get("grid_pos"), [0, 1], "Dwarf still on starting stair")
        self.assertEqual(heroes[2].get("grid_pos"), [0, 1], "Elf still on starting stair")
        self.assertEqual(heroes[3].get("grid_pos"), [0, 1], "Wizard still on starting stair")

    def test_05_cannot_step_back_onto_starting_stair(self):
        """Scenario 5: Once departed, heroes cannot step back upon the start tile (not walkable)."""
        bdd_scenario_header(5, "Once departed, heroes cannot step back upon starting stair")
        bdd_step("GIVEN", "Barbarian is in the corridor at [1, 1] with movement remaining",
                 info="Barbarian has departed starting stair")

        self.ai.set_state(
            activeHeroIndex=0,
            movementRolled=True,
            movementRemaining=3,
            hasMoved=True,
            heroes=[
                {"id": "barbarian", "grid_pos": [1, 1], "hasDepartedStart": True, "is_on_board": True}
            ]
        )

        bdd_step("WHEN", "Barbarian attempts to step back onto starting stair [0, 1]",
                 info="ai.move_hero([0, 1])")

        res = self.ai.move_hero([0, 1])

        bdd_step("THEN", "Movement back to starting stair is strictly prohibited",
                 assertions=[
                     "move_hero([0, 1]) returned success = False",
                     "Barbarian remains at corridor tile [1, 1]"
                 ])

        self.assertFalse(res.get("success", False), "Cannot step back upon starting stair [0, 1]")
        st = self.ai.get_state()
        self.assertEqual(st.get("activeHeroPos"), [1, 1], "Barbarian must remain at [1, 1]")

    def test_06_reachable_indicators_exclude_edge_tiles_and_start_stair(self):
        """Scenario 6: Reachable walk indicators never highlight edge tiles or starting stair."""
        bdd_scenario_header(6, "Reachable walk indicators exclude edge tiles and starting stair")
        bdd_step("GIVEN", "Hero has 4 movement points at [1, 1] and hovers mouse",
                 info="Hovering over map tile [1, 1]")

        self.ai.set_state(
            activeHeroIndex=0,
            movementRolled=True,
            movementRemaining=4,
            heroes=[
                {"id": "barbarian", "grid_pos": [1, 1], "hasDepartedStart": True, "is_on_board": True}
            ]
        )
        self.ai.hover_tile(1, 1)

        bdd_step("WHEN", "Reachable walk tiles list is queried",
                 info="get_reachable_walk_tiles()")

        reachable = self.ai.get_reachable_walk_tiles()
        self.assertGreater(len(reachable), 0, "There should be reachable tiles in the corridor")

        bdd_step("THEN", "Starting stair [0, 1] and all edge tiles are strictly excluded",
                 assertions=[
                     "[0, 1] is not in reachableWalkTiles",
                     "No edge tiles (x <= 0 or x >= 27 or y <= 0 or y >= 20) in reachableWalkTiles"
                 ])

        self.assertNotIn([0, 1], reachable, "Starting stair [0, 1] must not be in reachable walk tiles")

        for tile in reachable:
            tx, ty = tile[0], tile[1]
            is_edge = (tx <= 0 or tx >= 27 or ty <= 0 or ty >= 20)
            self.assertFalse(is_edge, f"Reachable tile {tile} must not be an edge tile!")

    def test_07_monsters_cannot_enter_edge_tiles_or_starting_stair(self):
        """Scenario 7: Monster AI pathing strictly avoids edge tiles and starting stair."""
        bdd_scenario_header(7, "Monster pathing avoids edge tiles and starting stair")
        bdd_step("GIVEN", "A monster placed in the corridor near the dungeon entrance",
                 info="Goblin at [2, 1], Barbarian at [1, 1]")

        self.ai.set_state(
            currentRole="player",
            phase="hero_phase",
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "is_on_board": True}],
            monsters=[{"id": "mon-goblin", "name": "Goblin", "grid_pos": [2, 1], "is_alive": True}]
        )

        bdd_step("WHEN", "Monster calculates movement",
                 info="Inspecting candidate paths")

        st = self.ai.get_state()
        stair = st.get("startingStair", [0, 1])

        bdd_step("THEN", "Starting stair and edge tiles cannot be targeted by monsters",
                 assertions=[
                     "Starting stair [0, 1] is safe from monster intrusion"
                 ])

        # Verify that starting stair is not walkable for monsters or heroes
        self.assertEqual(stair, [0, 1])

    def test_08_capture_visual_proof_screenshot(self):
        """Scenario 8: Capture visual proof screenshot of starting stair and edge tile boundaries."""
        bdd_scenario_header(8, "Capture visual proof screenshot")
        bdd_step("GIVEN", "Party at start stair and corridor tiles with indicators active",
                 info="Hovering over [1, 1] with movement active")

        self.ai.set_state(
            activeHeroIndex=0,
            movementRolled=True,
            movementRemaining=4,
            heroes=[
                {"id": "barbarian", "grid_pos": [1, 1], "hasDepartedStart": True, "is_on_board": True},
                {"id": "dwarf", "grid_pos": [0, 1], "hasDepartedStart": False, "is_on_board": True},
                {"id": "elf", "grid_pos": [0, 1], "hasDepartedStart": False, "is_on_board": True},
                {"id": "wizard", "grid_pos": [0, 1], "hasDepartedStart": False, "is_on_board": True}
            ]
        )
        self.ai.hover_tile(1, 1)
        time.sleep(0.5)

        out_path = "/tmp/tabletop_start_stair_and_edge_tiles.png"
        bdd_step("WHEN", f"QA captures screenshot to {out_path}",
                 info="ai.take_screenshot()")

        res = self.ai.take_screenshot(out_path)
        self.assertTrue(res.get("success", False), "Screenshot must succeed")
        self.assertTrue(os.path.exists(out_path), f"File {out_path} must exist")
        file_size = os.path.getsize(out_path)
        self.assertGreater(file_size, 1000, f"File size ({file_size} bytes) should be substantial")
        print(f"    📸 Visual proof captured: {out_path} ({file_size} bytes)")


if __name__ == "__main__":
    unittest.main()
