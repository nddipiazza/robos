#!/usr/bin/env python3
"""
test_middle_rooms_furniture_unblock_doors_e2e.py
BDD End-to-End Test Suite verifying that the Sorcerer's Altar and Council Table
in the middle rooms never block doorways, enabling clean hero door opening, entry,
and aisle navigation.

HeroQuest Rules & Requirements:
1. Heroes must be able to open doors and step unimpeded into room entrance squares.
2. Furniture pieces (Altar, Table) must not inhabit or overlap door destination tiles:
   - room-center-mid (Great Center Chamber): West door (13, 10) and East door (16, 10).
   - room-center-s (South Central Chamber): West door (13, 16).
3. The horizontal aisle (row 10) between the West and East doors of the Great Center Chamber
   remains completely unobstructed.
4. Hero movement pathfinding freely enters both chambers and navigates around furniture.
5. In-engine visual screenshot proof is captured and archived.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"🏛️ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestMiddleRoomsFurnitureUnblockDoorsE2E(unittest.TestCase):
    player: TabletopQAPlayer
    godot_proc: subprocess.Popen | None = None
    port: int = 18145

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🏛️ FEATURE: Middle Rooms Altar & Table Door Clearance (Unblocked Entrances)")
        print("   Rule: Furniture must never block room doors or prevent heroes from stepping inside.")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.env["DISPLAY"] = ":0"

        cls.player = TabletopQAPlayer(port=cls.port)
        if not cls.player.check_health():
            print(f"Launching Godot test player on port {cls.port}...")
            cls.godot_proc = subprocess.Popen(
                ["/home/ndipiazza/.local/bin/godot", "--path", ROOT_DIR, "--player", "--skip-spell-select"],
                env=cls.env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            connected = False
            for _ in range(40):
                if cls.player.check_health():
                    connected = True
                    break
                time.sleep(0.3)
            if not connected:
                if cls.godot_proc:
                    cls.godot_proc.terminate()
                raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.godot_proc:
            cls.godot_proc.terminate()
            try:
                cls.godot_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.godot_proc.kill()

    def setUp(self):
        self.player.reset_game()
        time.sleep(0.1)

    def test_01_static_cartridge_door_and_furniture_clearance(self):
        bdd_scenario_header(1, "Static Audit: Zero Furniture Overlaps With Any Door Across All Maps")
        bdd_step("GIVEN", "Cartridge map definitions for HeroQuest: The Trial")

        cartridge_path = os.path.join(ROOT_DIR, "cartridges", "heroquest-the-trial.cartridge.json")
        with open(cartridge_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        trial = data["maps"]["heroquest-the-trial"]
        door_tiles = set()
        for d in trial.get("doors", []):
            door_tiles.add(tuple(d["to"]))
            door_tiles.add(tuple(d["from"]))

        bdd_step("WHEN", "Checking all furniture tiles against all doorway coordinates")
        blocked_tiles = []
        for furn in trial.get("furniture", []):
            fx = furn.get("x", 0)
            fy = furn.get("y", 0)
            fw = furn.get("width", 1)
            fh = furn.get("height", 1)
            f_type = furn.get("type", "")
            if f_type == "altar" and fw == 1 and fh == 1: fw, fh = 3, 2
            elif f_type == "table" and fw == 1 and fh == 1: fw, fh = 3, 2
            for bx in range(fx, fx + fw):
                for by in range(fy, fy + fh):
                    if (bx, by) in door_tiles:
                        blocked_tiles.append((furn.get("id"), (bx, by)))

        bdd_step("THEN", "Zero furniture tiles collide with any door tile",
                 assertions=[
                     f"Total doors: {len(trial.get('doors', []))}",
                     f"Total furniture pieces: {len(trial.get('furniture', []))}",
                     f"Colliding furniture door tiles: {blocked_tiles} (expected empty)"
                 ])
        self.assertEqual(len(blocked_tiles), 0, f"Furniture must not overlap door tiles: {blocked_tiles}")

    def test_02_middle_rooms_doorway_tile_occupancy_telemetry(self):
        bdd_scenario_header(2, "In-Engine Telemetry: Middle Room Doorways Are 100% Unoccupied by Furniture")
        bdd_step("GIVEN", "Active tabletop world loaded with Quest 1: The Trial")

        bdd_step("WHEN", "Querying is_tile_occupied_by_furniture for middle room doorways")
        mid_west_door_occupied = self.player.is_tile_occupied_by_furniture(13, 10)
        mid_east_door_occupied = self.player.is_tile_occupied_by_furniture(16, 10)
        south_west_door_occupied = self.player.is_tile_occupied_by_furniture(13, 16)

        bdd_step("THEN", "All middle room doorway tiles report unoccupied (False)",
                 assertions=[
                     f"Great Center Chamber West Door (13, 10) occupied: {mid_west_door_occupied} (expected False)",
                     f"Great Center Chamber East Door (16, 10) occupied: {mid_east_door_occupied} (expected False)",
                     f"South Central Chamber West Door (13, 16) occupied: {south_west_door_occupied} (expected False)"
                 ])
        self.assertFalse(mid_west_door_occupied, "Tile (13, 10) must be unoccupied by furniture")
        self.assertFalse(mid_east_door_occupied, "Tile (16, 10) must be unoccupied by furniture")
        self.assertFalse(south_west_door_occupied, "Tile (13, 16) must be unoccupied by furniture")

        bdd_step("AND", "Altar and Table report properly occupied on their reorganized tiles",
                 assertions=[
                     f"Altar tile (14, 8) occupied: {self.player.is_tile_occupied_by_furniture(14, 8)} (expected True)",
                     f"Altar tile (15, 9) occupied: {self.player.is_tile_occupied_by_furniture(15, 9)} (expected True)",
                     f"Table tile (14, 14) occupied: {self.player.is_tile_occupied_by_furniture(14, 14)} (expected True)",
                     f"Table tile (15, 15) occupied: {self.player.is_tile_occupied_by_furniture(15, 15)} (expected True)"
                 ])
        self.assertTrue(self.player.is_tile_occupied_by_furniture(14, 8))
        self.assertTrue(self.player.is_tile_occupied_by_furniture(15, 9))
        self.assertTrue(self.player.is_tile_occupied_by_furniture(14, 14))
        self.assertTrue(self.player.is_tile_occupied_by_furniture(15, 15))

    def test_03_hero_enters_great_center_chamber_unimpeded(self):
        bdd_scenario_header(3, "Hero Opens West Door & Steps Into Great Center Chamber (13, 10)")
        bdd_step("GIVEN", "Barbarian standing at hallway threshold (12, 10) with 6 movement squares")

        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=6,
            movementRolled=True,
            movementClosed=False,
            heroes=[{"id": "barbarian", "grid_pos": [12, 10], "current_bp": 8, "is_on_board": True}]
        )

        bdd_step("WHEN", "Barbarian kicks open West door (12, 10 -> 13, 10)")
        door_res = self.player.open_door(12, 10, 13, 10)
        self.assertTrue(door_res.get("success"), "Door opening must succeed")

        bdd_step("AND", "Barbarian steps into Great Center Chamber at (13, 10)")
        move_res = self.player.move(13, 10)

        st_after = self.player.get_state()
        hero_pos = st_after.get("heroes", [{}])[0].get("grid_pos")

        bdd_step("THEN", "Barbarian enters (13, 10) successfully without being blocked by Altar",
                 assertions=[
                     f"Move success: {move_res.get('success')}",
                     f"Hero position: {hero_pos} (expected [13, 10])",
                     f"Movement remaining: {st_after.get('movementRemaining')} (expected 5)"
                 ])
        self.assertTrue(move_res.get("success"), "Stepping through door must succeed")
        self.assertEqual(hero_pos, [13, 10], "Hero must be at [13, 10]")
        self.assertEqual(st_after.get("movementRemaining"), 5)

        bdd_step("AND", "Barbarian can traverse the central aisle along row 10 to (15, 10)")
        move_aisle = self.player.move(15, 10)
        st_aisle = self.player.get_state()
        pos_aisle = st_aisle.get("heroes", [{}])[0].get("grid_pos")
        self.assertTrue(move_aisle.get("success"))
        self.assertEqual(pos_aisle, [15, 10])

    def test_04_hero_enters_south_central_chamber_unimpeded(self):
        bdd_scenario_header(4, "Hero Opens West Door & Steps Into South Central Chamber (13, 16)")
        bdd_step("GIVEN", "Barbarian standing at hallway threshold (12, 16) with 6 movement squares")

        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=6,
            movementRolled=True,
            movementClosed=False,
            heroes=[{"id": "barbarian", "grid_pos": [12, 16], "current_bp": 8, "is_on_board": True}]
        )

        bdd_step("WHEN", "Barbarian kicks open West door (12, 16 -> 13, 16)")
        door_res = self.player.open_door(12, 16, 13, 16)
        self.assertTrue(door_res.get("success"), "Door opening must succeed")

        bdd_step("AND", "Barbarian steps into South Central Chamber at (13, 16)")
        move_res = self.player.move(13, 16)

        st_after = self.player.get_state()
        hero_pos = st_after.get("heroes", [{}])[0].get("grid_pos")

        bdd_step("THEN", "Barbarian enters (13, 16) successfully without being blocked by Table",
                 assertions=[
                     f"Move success: {move_res.get('success')}",
                     f"Hero position: {hero_pos} (expected [13, 16])",
                     f"Movement remaining: {st_after.get('movementRemaining')} (expected 5)"
                 ])
        self.assertTrue(move_res.get("success"), "Stepping through door must succeed")
        self.assertEqual(hero_pos, [13, 16], "Hero must be at [13, 16]")
        self.assertEqual(st_after.get("movementRemaining"), 5)

        bdd_step("AND", "Barbarian can navigate across the open row 16 to (16, 16)")
        move_east = self.player.move(16, 16)
        st_east = self.player.get_state()
        pos_east = st_east.get("heroes", [{}])[0].get("grid_pos")
        self.assertTrue(move_east.get("success"))
        self.assertEqual(pos_east, [16, 16])

    def test_05_visual_proof_screenshot(self):
        bdd_scenario_header(5, "Capture Visual Proof of Clear Middle Room Doorways")
        bdd_step("GIVEN", "Middle rooms revealed with open doorways and unblocked furniture")

        all_exp = []
        for x in range(11, 18):
            for y in range(1, 19):
                all_exp.append([x, y])

        self.player.set_state(
            revealedRooms=["room-center-n", "room-center-mid", "room-center-s"],
            exploredTiles=all_exp,
            role="player"
        )
        time.sleep(0.3)

        out_path = "/tmp/tabletop_middle_rooms_doors_unblocked.png"
        bdd_step("WHEN", f"Capturing visual proof screenshot to {out_path}")
        res = self.player.take_screenshot(out_path)
        self.assertTrue(res.get("success", False) or os.path.exists(out_path), "Screenshot capture must succeed")
        self.assertTrue(os.path.exists(out_path), f"File must exist: {out_path}")
        self.assertGreater(os.path.getsize(out_path), 5000, "Screenshot size must be > 5KB")

        artifact_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"
        dest_artifact = os.path.join(artifact_dir, "tabletop_middle_rooms_doors_unblocked.png")
        shutil.copyfile(out_path, dest_artifact)

        bdd_step("THEN", f"Screenshot saved to {dest_artifact} ({os.path.getsize(dest_artifact):,} bytes)",
                 assertions=[
                     f"Source: {out_path}",
                     f"Destination: {dest_artifact}",
                     f"Size: {os.path.getsize(dest_artifact):,} bytes"
                 ])


if __name__ == "__main__":
    unittest.main()
