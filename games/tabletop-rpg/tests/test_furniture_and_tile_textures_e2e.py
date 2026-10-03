#!/usr/bin/env python3
"""
==========================================================================================
🎨 FEATURE: AI-Generated Furniture & Map Tile Textures E2E Test Suite
   As a HeroQuest tabletop player & dungeon designer
   I expect all standard furniture items (altar, table, bookcase, bookshelf, tomb, chest,
   cupboard, weapons_rack, fireplace, throne, torture_rack, alchemists_bench)
   and standard map tiles / obstacles (wall_block, stairs, pit trap, spear trap,
   falling block, boulder) to be rendered with authentic AI-generated textures
   So that the board presents an authentic, rich tabletop miniature experience.
==========================================================================================
"""

import os
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
REPO_ROOT = os.path.dirname(os.path.dirname(ROOT_DIR))
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


class TestFurnitureAndTileTexturesE2E(unittest.TestCase):
    """BDD End-to-End tests verifying authentic AI textures for furniture, wall blocks,
    stairs, and dungeon tiles in the Godot Tabletop runtime."""

    proc = None
    ai = None
    port = 18128

    FURNITURE_KEYS = [
        "altar", "table", "bookcase", "bookshelf", "tomb", "chest",
        "cupboard", "weapons_rack", "fireplace", "throne", "torture_rack", "alchemists_bench"
    ]

    TILE_KEYS = [
        "wall_block", "stairs", "trap_pit", "trap_spear", "trap_falling_block", "boulder"
    ]

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎨 AI-GENERATED FURNITURE & MAP TILE TEXTURES E2E TEST SUITE")
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
        for _ in range(40):
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

    def test_01_all_18_texture_files_exist_in_runtime_and_editor_assets(self):
        """Scenario 01: Verify all 12 furniture and 6 tile textures exist as valid PNGs
        in both games/tabletop-rpg/assets/ and packages/robos-tabletop/assets/."""
        print("\n" + "=" * 85)
        print("🎨 SCENARIO 01: All 18 Texture Files Exist with Non-Zero Size in Both Repositories")
        print("=" * 85)

        bdd_step("GIVEN", "Asset directories for both Godot runtime and RobOS Tabletop Editor")
        runtime_furn = os.path.join(ROOT_DIR, "assets/furniture")
        runtime_tiles = os.path.join(ROOT_DIR, "assets/tiles")
        editor_furn = os.path.join(REPO_ROOT, "packages/robos-tabletop/assets/furniture")
        editor_tiles = os.path.join(REPO_ROOT, "packages/robos-tabletop/assets/tiles")

        bdd_step("THEN", "All 12 HeroQuest furniture PNGs exist and have size > 1000 bytes")
        for f in self.FURNITURE_KEYS:
            r_path = os.path.join(runtime_furn, f"{f}.png")
            e_path = os.path.join(editor_furn, f"{f}.png")
            self.assertTrue(os.path.exists(r_path), f"Runtime furniture texture missing: {r_path}")
            self.assertTrue(os.path.exists(e_path), f"Editor furniture texture missing: {e_path}")
            r_sz = os.path.getsize(r_path)
            e_sz = os.path.getsize(e_path)
            self.assertGreater(r_sz, 1000, f"Runtime texture {f}.png too small: {r_sz} bytes")
            self.assertGreater(e_sz, 1000, f"Editor texture {f}.png too small: {e_sz} bytes")
            print(f"    ✔  [ASSET] Furniture: {f}.png ({r_sz} bytes)")

        bdd_step("AND", "All 6 HeroQuest tile / obstacle PNGs exist and have size > 1000 bytes")
        for t in self.TILE_KEYS:
            r_path = os.path.join(runtime_tiles, f"{t}.png")
            e_path = os.path.join(editor_tiles, f"{t}.png")
            self.assertTrue(os.path.exists(r_path), f"Runtime tile texture missing: {r_path}")
            self.assertTrue(os.path.exists(e_path), f"Editor tile texture missing: {e_path}")
            r_sz = os.path.getsize(r_path)
            e_sz = os.path.getsize(e_path)
            self.assertGreater(r_sz, 1000, f"Runtime texture {t}.png too small: {r_sz} bytes")
            self.assertGreater(e_sz, 1000, f"Editor texture {t}.png too small: {e_sz} bytes")
            print(f"    ✔  [ASSET] Tile: {t}.png ({r_sz} bytes)")

    def test_02_godot_engine_runtime_loads_all_textures(self):
        """Scenario 02: Verify Godot TabletopWorld loads furniture_textures and tile_textures."""
        print("\n" + "=" * 85)
        print("🎨 SCENARIO 02: Godot Runtime Preloads Furniture & Tile Texture Dictionaries")
        print("=" * 85)

        bdd_step("GIVEN", "Pristine Godot game session state")
        st = self.ai.get_state()
        manifest = st.get("textureManifest", {})
        furn_count = manifest.get("furnitureLoadedCount", 0)
        tiles_count = manifest.get("tilesLoadedCount", 0)

        bdd_step("THEN", "Runtime texture manifest reports at least 12 furniture and 6 tile textures loaded",
                 assertions=[
                     f"Furniture Loaded Count: {furn_count} (expected >= 12)",
                     f"Tiles Loaded Count: {tiles_count} (expected >= 6)"
                 ])
        self.assertGreaterEqual(furn_count, 12, "Must load all 12 furniture textures in Godot")
        self.assertGreaterEqual(tiles_count, 6, "Must load all tile textures in Godot")

    def test_03_furniture_on_board_reports_active_textures(self):
        """Scenario 03: Verify all furniture items on the board have hasTexture: True and valid path."""
        print("\n" + "=" * 85)
        print("🎨 SCENARIO 03: Board Furniture Has Active Texture Metadata")
        print("=" * 85)

        bdd_step("GIVEN", "Tabletop state for Quest 1: The Trial")
        st = self.ai.get_state()
        furn_list = st.get("furniture", [])
        self.assertGreater(len(furn_list), 0, "Board should contain furniture")

        bdd_step("THEN", "Every furniture piece has hasTexture == True and texturePath != ''")
        for f in furn_list:
            f_id = f.get("id", "")
            f_type = f.get("type", "")
            has_tex = f.get("hasTexture", False)
            tex_path = f.get("texturePath", "")
            self.assertTrue(has_tex, f"Furniture {f_id} ({f_type}) should have hasTexture == True")
            self.assertTrue(tex_path.startswith("res://assets/furniture/") or tex_path.startswith("res://assets/tiles/"),
                            f"Furniture {f_id} texturePath should point to valid asset path: {tex_path}")
            print(f"    ✔  [FURNITURE TEXTURE] {f_id} ({f_type}): {tex_path}")

    def test_04_wall_blocks_and_starting_stairs_have_active_textures(self):
        """Scenario 04: Verify wall blocks and starting stairs report authentic textures."""
        print("\n" + "=" * 85)
        print("🎨 SCENARIO 04: Wall Blocks & Starting Stairs Report Active Textures")
        print("=" * 85)

        bdd_step("GIVEN", "Tabletop state")
        st = self.ai.get_state()
        wb_list = st.get("wallBlocks", [])
        self.assertGreater(len(wb_list), 0, "Board should contain wall blocks")

        bdd_step("THEN", "All wall blocks report hasTexture == True and texturePath for wall_block")
        for wb in wb_list:
            wb_id = wb.get("id", "")
            has_tex = wb.get("hasTexture", False)
            tex_path = wb.get("texturePath", "")
            self.assertTrue(has_tex, f"Wall block {wb_id} should have hasTexture == True")
            self.assertTrue("wall_block.png" in tex_path,
                            f"Wall block {wb_id} should use wall_block.png: {tex_path}")

        bdd_step("AND", "Starting stairs report hasStartingStairTexture == True and stairs.png")
        has_stair_tex = st.get("hasStartingStairTexture", False)
        stair_path = st.get("startingStairTexturePath", "")
        self.assertTrue(has_stair_tex, "Starting stairs should have hasStartingStairTexture == True")
        self.assertTrue("stairs.png" in stair_path, f"Starting stairs should use stairs.png: {stair_path}")
        print(f"    ✔  [STAIRS TEXTURE] {stair_path}")

    def test_05_traps_report_active_textures(self):
        """Scenario 05: Verify traps report hasTexture: True and valid trap textures."""
        print("\n" + "=" * 85)
        print("🎨 SCENARIO 05: Traps Report Active Textures")
        print("=" * 85)

        bdd_step("GIVEN", "Tabletop state")
        st = self.ai.get_state()
        traps_list = st.get("traps", [])
        self.assertGreater(len(traps_list), 0, "Board should contain traps")

        bdd_step("THEN", "Every trap reports hasTexture == True and texturePath pointing to tiles")
        for tr in traps_list:
            tr_id = tr.get("id", "")
            tr_type = tr.get("type", "")
            has_tex = tr.get("hasTexture", False)
            tex_path = tr.get("texturePath", "")
            self.assertTrue(has_tex, f"Trap {tr_id} ({tr_type}) should have hasTexture == True")
            self.assertTrue("res://assets/tiles/" in tex_path,
                            f"Trap {tr_id} should use tile texture: {tex_path}")
            print(f"    ✔  [TRAP TEXTURE] {tr_id} ({tr_type}): {tex_path}")

    def test_06_capture_viewport_screenshot_with_rendered_textures(self):
        """Scenario 06: Capture viewport screenshot to verify visual rendering of board with textures."""
        print("\n" + "=" * 85)
        print("🎨 SCENARIO 06: Capture Viewport Screenshot with Rendered Textures")
        print("=" * 85)

        bdd_step("GIVEN", "Running game session with rendered furniture and tile textures")
        self.ai.set_state(activeHero="barbarian")
        time.sleep(0.1)

        bdd_step("WHEN", "Capturing viewport screenshot")
        shot_path = os.path.join(ROOT_DIR, "tests/recordings/furniture_and_tile_textures_proof.png")
        os.makedirs(os.path.dirname(shot_path), exist_ok=True)
        res = self.ai.take_screenshot(shot_path)

        bdd_step("THEN", "Screenshot is successfully saved and non-empty",
                 assertions=[
                     f"Screenshot Path: {shot_path}",
                     f"File Exists: {os.path.exists(shot_path)}",
                     f"File Size: {os.path.getsize(shot_path) if os.path.exists(shot_path) else 0} bytes"
                 ])
        self.assertTrue(os.path.exists(shot_path), "Screenshot file must exist")
        self.assertGreater(os.path.getsize(shot_path), 5000, "Screenshot must be a valid image")


if __name__ == "__main__":
    unittest.main()
