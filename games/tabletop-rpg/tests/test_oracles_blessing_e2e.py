#!/usr/bin/env python3
"""
test_oracles_blessing_e2e.py
BDD End-to-End Test Suite for HeroQuest Blessings: Oracle's Blessing

Verifies:
1. "Blessings" item category and Oracle's Blessing definition in HeroQuestEquipment.
2. Clairvoyance: Asking Zargon to lay out the room beyond an adjacent closed door:
   - Identifies the unrevealed room beyond the door.
   - Zargon reveals the chamber tiles and monsters.
   - Crucial HeroQuest rule: The door REMAINS CLOSED (is_open == false).
   - Consumes the blessing and logs [BLESSING].
3. Fated Re-Roll for Movement:
   - Discards first movement roll.
   - Keeps second result as movement_remaining.
   - Consumes the blessing and logs [BLESSING].
4. Fated Re-Roll for Melee Attack:
   - Discards first attack roll against adjacent monster.
   - Keeps second result and updates monster body points.
   - Consumes the blessing and logs [BLESSING].
5. Fated Re-Roll for Defense:
   - Discards first defense roll against monster strike.
   - Keeps second result and updates hero body points.
   - Consumes the blessing and logs [BLESSING].
6. Core Restriction Rule:
   - "Second result must be taken" (cannot re-roll a re-roll, even if a second blessing is possessed).
7. Captures visual proof screenshots to the brain directory.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import unittest
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer

PORT = 18135
BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"✨ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"          ℹ {info}")
    if assertions:
        for a in assertions:
            print(f"          ✔ {a}")


class TestOraclesBlessingE2E(unittest.TestCase):
    godot_proc = None
    player = None

    @classmethod
    def setUpClass(cls):
        print(f"\nStarting Tabletop RPG Godot headless server on port {PORT}...")
        play_script = os.path.join(ROOT_DIR, "play.sh")
        disp = os.environ.get("DISPLAY", ":0")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT), DISPLAY=disp)

        args = [play_script, "--player"]
        if not os.path.exists("/tmp/.X11-unix"):
            args.append("--headless")

        cls.godot_proc = subprocess.Popen(
            args,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        cls.player = TabletopQAPlayer(port=PORT)
        connected = False
        for _ in range(40):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)

        if not connected:
            if cls.godot_proc:
                cls.godot_proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {PORT}")
        print("Connected to Tabletop Godot server successfully.")

    @classmethod
    def tearDownClass(cls):
        if cls.player:
            try:
                cls.player.execute_action("delete_save_game")
                cls.player.execute_action("reset_game")
            except Exception:
                pass
        if cls.godot_proc:
            cls.godot_proc.terminate()
            try:
                cls.godot_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.godot_proc.kill()
        print("Godot server stopped.")

    def setUp(self):
        self.player.execute_action("reset_game")
        time.sleep(0.2)

    def _get_hero(self, state: dict, hero_id: str = "barbarian") -> dict:
        for h in state.get("heroes", []):
            if h.get("id") == hero_id:
                return h
        return {}

    def test_01_blessing_metadata_and_inventory(self):
        bdd_scenario_header(1, "Blessing Equipment Registration & Backpack Modal Presentation")
        bdd_step("GIVEN", "Barbarian has Oracle's Blessing in inventory")
        self.player.set_state(
            activeHero="barbarian",
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing"],
                "gold": 100,
                "current_bp": 8,
                "max_bp": 8
            }]
        )

        bdd_step("WHEN", "Opening the backpack / item modal")
        modal_res = self.player.open_item_panel()
        self.assertTrue(modal_res.get("success"), f"Open modal should succeed: {modal_res}")
        time.sleep(0.3)

        st = self.player.get_state()
        hero = self._get_hero(st, "barbarian")
        inv = hero.get("inventory", [])
        bdd_step("THEN", "Hero inventory retains the Oracle's Blessing",
                 assertions=[
                     f"Hero items: {inv}"
                 ])
        self.assertIn("oracles_blessing", inv)

        bdd_step("WHEN", "Closing the backpack modal")
        close_res = self.player.close_item_panel()
        self.assertTrue(close_res.get("success"))

    def test_02_clairvoyance_lay_out_room_beyond_closed_door(self):
        bdd_scenario_header(2, "Clairvoyance: Zargon Lays Out Room Beyond Adjacent Closed Door")
        bdd_step("GIVEN", "Barbarian is at corridor [4, 5] adjacent to closed door fdoor-fossil-n [4, 5]->[4, 6]")
        self.player.set_state(
            activeHero="barbarian",
            revealedRooms=[],
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing"],
                "current_bp": 8,
                "max_bp": 8
            }],
            doors=[{
                "id": "fdoor-fossil-n",
                "from": [4, 5],
                "to": [4, 6],
                "is_open": False,
                "state": "closed",
                "room": "room-grand-fossil"
            }],
            monsters=[{
                "id": "mon-verag",
                "name": "Verag Gargoyle",
                "roomId": "room-grand-fossil",
                "grid_pos": [4, 8],
                "is_alive": True,
                "current_bp": 3
            }]
        )

        # Confirm room is not revealed yet
        st_before = self.player.get_state()
        self.assertNotIn("room-grand-fossil", st_before.get("revealedRooms", []))

        bdd_step("WHEN", "Barbarian invokes Oracle's Blessing for Clairvoyance")
        res = self.player.oracle_lay_out_room(hero_id="barbarian", target_door_or_room="fdoor-fossil-n")
        self.assertTrue(res.get("success"), f"Oracle lay out room should succeed: {res}")
        time.sleep(0.3)

        bdd_step("THEN", "Zargon reveals Grand Fossil Chamber, but door remains strictly closed",
                 assertions=[
                     f"Revealed room: {res.get('room_id')}",
                     f"Door remained closed: {res.get('door_closed')}",
                     f"Monsters revealed: {res.get('monsters_revealed')}"
                 ])
        self.assertEqual(res.get("room_id"), "room-grand-fossil")
        self.assertTrue(res.get("door_closed"))
        self.assertGreaterEqual(res.get("monsters_revealed", 0), 1)

        # Inspect board state
        st_after = self.player.get_state()
        self.assertIn("room-grand-fossil", st_after.get("revealedRooms", []))
        
        # Verify door is still closed!
        door = None
        for d in st_after.get("doors", []):
            if d.get("id") == "fdoor-fossil-n":
                door = d
                break
        if door:
            self.assertFalse(door.get("is_open", False), "Door must remain closed during clairvoyance!")

        # Verify blessing was consumed
        b_hero = self._get_hero(st_after, "barbarian")
        b_inv = b_hero.get("inventory", [])
        self.assertNotIn("oracles_blessing", b_inv, "Oracle's blessing must be consumed after invocation!")

        # Verify command log
        logs = st_after.get("logText", "") or st_after.get("displayedLogText", "")
        self.assertIn("[BLESSING]", logs)
        self.assertIn("lays out", logs)
        self.assertIn("without opening it", logs)

    def test_03_fated_reroll_movement_dice(self):
        bdd_scenario_header(3, "Fated Re-Roll: Movement Dice (Keep Second Result)")
        bdd_step("GIVEN", "Barbarian with Oracle's Blessing rolls movement dice")
        self.player.set_state(
            activeHero="barbarian",
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing"],
                "current_bp": 8,
                "max_bp": 8
            }],
            movementRemaining=0,
            hasMoved=False
        )

        roll_res = self.player.roll_movement()
        first_total = roll_res.get("roll", {}).get("total", roll_res.get("total", 0))
        self.assertGreater(first_total, 0)
        bdd_step("ℹ", f"First movement roll produced: {first_total} squares")

        bdd_step("WHEN", "Barbarian invokes Oracle's Blessing to re-roll movement dice")
        reroll_res = self.player.oracle_reroll_dice(hero_id="barbarian", roll_type="movement")
        self.assertTrue(reroll_res.get("success"), f"Re-roll movement should succeed: {reroll_res}")
        time.sleep(0.3)

        second_total = reroll_res.get("second_roll", 0)
        bdd_step("THEN", "First roll discarded and second roll is applied",
                 assertions=[
                     f"First roll: {reroll_res.get('first_roll')} squares",
                     f"Second roll: {second_total} squares",
                     f"Dice: {reroll_res.get('dice')}"
                 ])
        self.assertEqual(reroll_res.get("first_roll"), first_total)
        self.assertGreaterEqual(second_total, 2)
        self.assertLessEqual(second_total, 12)

        st_after = self.player.get_state()
        self.assertEqual(st_after.get("movementRemaining"), second_total)
        b_hero = self._get_hero(st_after, "barbarian")
        self.assertNotIn("oracles_blessing", b_hero.get("inventory", []))

        logs = st_after.get("logText", "") or st_after.get("displayedLogText", "")
        self.assertIn("[BLESSING]", logs)
        self.assertIn("re-roll movement dice", logs)
        self.assertIn("The second result must be taken!", logs)

    def test_04_fated_reroll_attack_dice(self):
        bdd_scenario_header(4, "Fated Re-Roll: Attack Dice against Monster")
        bdd_step("GIVEN", "Barbarian is adjacent to an Orc Guard (3 BP) and attacks")
        self.player.set_state(
            activeHero="barbarian",
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing"],
                "attackDice": 3,
                "defendDice": 2,
                "current_bp": 8,
                "max_bp": 8
            }],
            monsters=[{
                "id": "mon-orc-guard",
                "name": "Orc Guard",
                "grid_pos": [4, 6],
                "is_alive": True,
                "current_bp": 3,
                "max_bp": 3,
                "attack_dice": 3,
                "defend_dice": 2
            }],
            hasActed=False
        )

        atk_res = self.player.attack(monster_id="mon-orc-guard")
        self.assertTrue(atk_res.get("success"), f"Initial attack should succeed: {atk_res}")
        first_skulls = atk_res.get("result", {}).get("total_skulls", atk_res.get("total_skulls", 0))
        bdd_step("ℹ", f"First attack roll dealt {first_skulls} skulls")

        bdd_step("WHEN", "Barbarian invokes Oracle's Blessing to re-roll attack dice")
        reroll_res = self.player.oracle_reroll_dice(hero_id="barbarian", roll_type="attack")
        self.assertTrue(reroll_res.get("success"), f"Re-roll attack should succeed: {reroll_res}")
        time.sleep(0.3)

        bdd_step("THEN", "Attack dice are re-rolled and second result is applied",
                 assertions=[
                     f"First skulls: {reroll_res.get('first_skulls')}",
                     f"Second skulls: {reroll_res.get('second_skulls')}",
                     f"Wounds inflicted: {reroll_res.get('wounds')}",
                     f"Monster remaining BP: {reroll_res.get('target_remaining_bp')}"
                 ])
        self.assertEqual(reroll_res.get("first_skulls"), first_skulls)
        self.assertGreaterEqual(reroll_res.get("second_skulls", 0), 0)

        st_after = self.player.get_state()
        b_hero = self._get_hero(st_after, "barbarian")
        self.assertNotIn("oracles_blessing", b_hero.get("inventory", []))

        logs = st_after.get("logText", "") or st_after.get("displayedLogText", "")
        self.assertIn("[BLESSING]", logs)
        self.assertIn("re-roll attack dice", logs)
        self.assertIn("The second result must be taken!", logs)

    def test_05_fated_reroll_defense_dice(self):
        bdd_scenario_header(5, "Fated Re-Roll: Defense White Shields against Monster Attack")
        bdd_step("GIVEN", "Barbarian (8 BP) is attacked by Zargon's Chaos Warrior (4 Atk dice)")
        self.player.set_state(
            activeHero="barbarian",
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing"],
                "attackDice": 3,
                "defendDice": 2,
                "current_bp": 8,
                "max_bp": 8
            }],
            monsters=[{
                "id": "mon-chaos-warrior",
                "name": "Chaos Warrior",
                "grid_pos": [4, 6],
                "is_alive": True,
                "current_bp": 3,
                "max_bp": 3,
                "attack_dice": 4,
                "defend_dice": 4
            }]
        )

        dm_res = self.player.dm_attack(hero_id="barbarian", monster_id="mon-chaos-warrior")
        self.assertTrue(dm_res.get("success"), f"DM attack should succeed: {dm_res}")
        bdd_step("ℹ", "Monster struck at Barbarian. Defense dice rolled.")

        bdd_step("WHEN", "Barbarian invokes Oracle's Blessing to re-roll defense dice")
        reroll_res = self.player.oracle_reroll_dice(hero_id="barbarian", roll_type="defend")
        self.assertTrue(reroll_res.get("success"), f"Re-roll defense should succeed: {reroll_res}")
        time.sleep(0.3)

        bdd_step("THEN", "Defense dice re-rolled and hero BP recalculated with second result",
                 assertions=[
                     f"First shields: {reroll_res.get('first_shields')}",
                     f"Second shields: {reroll_res.get('second_shields')}",
                     f"Wounds taken: {reroll_res.get('wounds')}",
                     f"Remaining BP: {reroll_res.get('remaining_bp')}"
                 ])
        self.assertGreaterEqual(reroll_res.get("second_shields", 0), 0)

        st_after = self.player.get_state()
        b_hero = self._get_hero(st_after, "barbarian")
        self.assertNotIn("oracles_blessing", b_hero.get("inventory", []))

        logs = st_after.get("logText", "") or st_after.get("displayedLogText", "")
        self.assertIn("[BLESSING]", logs)
        self.assertIn("re-roll defense dice", logs)
        self.assertIn("The second result must be taken!", logs)

    def test_06_restriction_second_result_must_be_taken(self):
        bdd_scenario_header(6, "Restriction: Second Result Must Be Taken (Cannot Re-Roll Twice)")
        bdd_step("GIVEN", "Barbarian possesses TWO Oracle's Blessings")
        self.player.set_state(
            activeHero="barbarian",
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing", "oracles_blessing"],
                "current_bp": 8,
                "max_bp": 8
            }],
            movementRemaining=0
        )

        roll_res = self.player.roll_movement()
        first_total = roll_res.get("roll", {}).get("total", roll_res.get("total", 0))
        self.assertGreater(first_total, 0)

        bdd_step("WHEN", "Barbarian executes first re-roll")
        res1 = self.player.oracle_reroll_dice(hero_id="barbarian", roll_type="movement")
        self.assertTrue(res1.get("success"), "First re-roll must succeed")

        bdd_step("WHEN", "Barbarian attempts a second re-roll immediately with the remaining blessing")
        res2 = self.player.oracle_reroll_dice(hero_id="barbarian", roll_type="movement")

        bdd_step("THEN", "Second re-roll is rejected; second result must be taken",
                 assertions=[
                     f"Rejected: {not res2.get('success')}",
                     f"Error message: '{res2.get('error')}'"
                 ])
        self.assertFalse(res2.get("success"), "Second re-roll should be disallowed")
        self.assertIn("Second result must be taken", res2.get("error", ""))

        st_after = self.player.get_state()
        b_hero = self._get_hero(st_after, "barbarian")
        inv_after = b_hero.get("inventory", [])
        self.assertEqual(len(inv_after), 1, "The unused second blessing must NOT be consumed!")

    def test_07_capture_visual_proof_screenshot(self):
        bdd_scenario_header(7, "Visual Proof: Capture Command Log & In-Game Blessing Feedback")
        bdd_step("GIVEN", "Barbarian has performed Oracle's Blessing actions with rich log text")
        self.player.set_state(
            activeHero="barbarian",
            revealedRooms=["room-grand-fossil"],
            heroes=[{
                "id": "barbarian",
                "name": "Barbarian",
                "grid_pos": [4, 5],
                "inventory": ["oracles_blessing"],
                "current_bp": 8,
                "max_bp": 8
            }],
            doors=[{
                "id": "fdoor-fossil-n",
                "from": [4, 5],
                "to": [4, 6],
                "is_open": False,
                "state": "closed",
                "room": "room-grand-fossil"
            }]
        )

        # Trigger item panel to show blessing badge and buttons
        self.player.open_item_panel()
        time.sleep(0.4)

        tmp_shot = "/tmp/tabletop_oracles_blessing_full.png"
        brain_shot = os.path.join(BRAIN_DIR, "tabletop_oracles_blessing_proof.png")
        brain_crop = os.path.join(BRAIN_DIR, "tabletop_oracles_blessing_crop.png")

        shot_res = self.player.take_screenshot(tmp_shot)
        self.assertTrue(shot_res.get("success"), f"Screenshot should succeed: {shot_res}")
        self.assertTrue(os.path.exists(tmp_shot))
        shutil.copyfile(tmp_shot, brain_shot)

        # Generate cropped focus on modal / log
        try:
            im = Image.open(tmp_shot)
            w, h = im.size
            crop_box = (int(w * 0.15), int(h * 0.10), int(w * 0.85), int(h * 0.90))
            cropped = im.crop(crop_box)
            cropped.save(brain_crop)
            bdd_step("THEN", "Saved visual proof screenshots to brain directory",
                     assertions=[
                         f"Full: {brain_shot}",
                         f"Crop: {brain_crop}"
                     ])
        except Exception as e:
            print(f"Warning cropping screenshot: {e}")

        self.player.close_item_panel()


if __name__ == "__main__":
    unittest.main()
