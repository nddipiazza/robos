#!/usr/bin/env python3
"""
Automated Verification Suite for RobOS Tabletop RPG & HeroQuest Cartridge Player
Validates cartridge structure, 26x19 board dimensions, hero stat blocks,
Player Mode execution, and DunMaster Mode execution.
"""

import json
import os
import subprocess
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CARTRIDGE_PATH = os.path.join(ROOT_DIR, "cartridges", "heroquest-the-trial.cartridge.json")

class TestHeroQuestCartridge(unittest.TestCase):
    def setUp(self):
        self.assertTrue(os.path.exists(CARTRIDGE_PATH), f"Cartridge must exist at {CARTRIDGE_PATH}")
        with open(CARTRIDGE_PATH, "r", encoding="utf-8") as f:
            self.cart = json.load(f)

    def test_cartridge_header_and_ruleset(self):
        header = self.cart.get("header", {})
        self.assertEqual(header.get("ruleset"), "heroquest")
        self.assertEqual(header.get("gameType"), "tabletop")
        self.assertEqual(header.get("heroCount"), 4)
        self.assertGreaterEqual(header.get("monsterCount", 0), 4)

    def test_classic_four_heroes(self):
        heroes = self.cart.get("heroes", {})
        self.assertIn("barbarian", heroes)
        self.assertIn("dwarf", heroes)
        self.assertIn("elf", heroes)
        self.assertIn("wizard", heroes)

        b = heroes["barbarian"]
        self.assertEqual(b.get("bodyPoints"), 8)
        self.assertEqual(b.get("mindPoints"), 2)
        self.assertEqual(b.get("attackDice"), 3)
        self.assertEqual(b.get("defendDice"), 2)

        w = heroes["wizard"]
        self.assertEqual(w.get("bodyPoints"), 4)
        self.assertEqual(w.get("mindPoints"), 6)
        self.assertEqual(w.get("attackDice"), 1)
        self.assertEqual(w.get("defendDice"), 2)

    def test_heroquest_board_dimensions(self):
        maps = self.cart.get("maps", {})
        trial_map = maps.get("the-trial") or maps.get("heroquest-the-trial")
        self.assertIsNotNone(trial_map, f"Trial map not found in {list(maps.keys())}")
        self.assertIn(trial_map.get("width"), [26, 28])
        self.assertIn(trial_map.get("height"), [19, 21])
        self.assertIn("rooms", trial_map)
        self.assertGreaterEqual(len(trial_map.get("rooms", [])), 16)
        self.assertIn("doors", trial_map)
        self.assertGreaterEqual(len(trial_map.get("doors", [])), 10)

    def test_headless_player_mode_execution(self):
        play_script = os.path.join(ROOT_DIR, "play.sh")
        cmd = [play_script, "--headless", "--role=player", "--auto-play", "--quit-after", "120"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        self.assertEqual(res.returncode, 0, f"Godot execution failed: {res.stderr}")
        self.assertIn("Player Mode Active", res.stdout)
        self.assertIn("Plugged in cartridge: HeroQuest: The Trial", res.stdout)

    def test_headless_game_master_mode_execution(self):
        play_script = os.path.join(ROOT_DIR, "play.sh")
        cmd = [play_script, "--headless", "--role=gm", "--auto-play", "--quit-after", "120"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        self.assertEqual(res.returncode, 0, f"Godot execution failed: {res.stderr}")
        self.assertTrue("Game Master" in res.stdout or "DunMaster Mode Active" in res.stdout)
        self.assertIn("Zargon, Master of Darkness", res.stdout)

    def test_headless_dunmaster_mode_execution(self):
        play_script = os.path.join(ROOT_DIR, "play.sh")
        cmd = [play_script, "--headless", "--role=dm", "--auto-play", "--quit-after", "120"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        self.assertEqual(res.returncode, 0, f"Godot execution failed: {res.stderr}")
        self.assertIn("DunMaster Mode Active", res.stdout)
        self.assertIn("Zargon, Master of Darkness", res.stdout)

    def test_raycasting_vision_and_room_revelation(self):
        sys.path.insert(0, ROOT_DIR)
        from rpc_ai.tabletop_qa_player import TabletopQAPlayer
        import time

        play_script = os.path.join(ROOT_DIR, "play.sh")
        proc = subprocess.Popen([play_script, "--headless", "--role=player"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            player = TabletopQAPlayer(port=18092)
            connected = False
            for _ in range(15):
                if player.check_health():
                    connected = True
                    break
                time.sleep(0.4)
            self.assertTrue(connected, "GameControlServer must be reachable on :18092")

            # 1. Initial State: Starting stairs explored via rays down corridor; crypt unrevealed
            st1 = player.get_state()
            self.assertEqual(st1.get("revealedRooms"), [], "Initial revealed rooms must be empty")
            initial_count = st1.get("exploredCount", 0)
            self.assertGreaterEqual(initial_count, 30, "Initial ray vision must explore corridor tiles")

            # 2. Kick open Northwest Crypt door (4, 1) -> (4, 2)
            door_res = player.open_door(4, 1, 4, 2)
            self.assertTrue(door_res.get("success"), "Door open action must succeed")

            # 3. Whole room immediately becomes visible
            st2 = player.get_state()
            self.assertIn("room-nw-crypt", st2.get("revealedRooms", []), "Northwest Crypt must immediately be revealed")
            # 20 tiles in Northwest Crypt (5x4)
            self.assertEqual(st2.get("exploredCount"), initial_count + 20, "Explored count must increase by all 20 room tiles")

            # 4. Combat log logs room reveal and spotted monsters
            combat_log = " ".join(st2.get("combatLog", []))
            self.assertIn("Northwest Crypt", combat_log)
            self.assertIn("Crypt Skeleton", combat_log)
        finally:
            proc.terminate()
            proc.wait()

if __name__ == "__main__":
    unittest.main()
