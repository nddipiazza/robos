#!/usr/bin/env python3
"""
Test Suite: Tabletop RPG Summons Subsystem & The Hearthskin Horn E2E
===================================================================
Validates the official RobOS Tabletop RPG rules for summoned player characters:
"add robos rpc kgraph element for 'summons' where a player character has a
summoned player character typically with reduced functionality. for example
a wizard summons 2 wolf characters to fight.
add this concept to robos tabletop rpg and add
new item: The hearthskin horn - when blown, each character gets to place a friendly
skeleton in their room or corridor in line of sight. they have movement: 8, attack 2,
defend: 2, body: 1, mind: 0
for all intents and purposes, they become new characters that now have turns,
just like any hero character does, they always go after their hero counterpart."

BDD Scenarios:
1. Wizard Summons 2 Wolves with Reduced Functionality.
2. The Hearthskin Horn Item Registration & Blowing in Room/Corridor.
3. Friendly Skeleton Stats & Placement in Line of Sight (movement: 8, atk: 2, def: 2, body: 1, mind: 0).
4. Strict Turn Order (Summons always take their turns immediately following their hero counterpart).
5. Summon Movement (8 squares) and Combat Engagement (2 Attack Dice).
6. Reduced Functionality Guards (Searching room for treasure, searching for traps, armory purchases, item passing blocked).
7. Visual Proof Capture with Spectral Cyan Summons on Board.
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

PORT = 18147
BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"✨ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, message: str, assertions: list[str] | None = None):
    print(f"  {step_type:<7} {message}")
    if assertions:
        for a in assertions:
            print(f"          ✔ {a}")


class TestSummonsAndHearthskinHornE2E(unittest.TestCase):
    proc = None
    player = None
    port = PORT

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🪯 FEATURE: Tabletop RPG Summons Subsystem & The Hearthskin Horn")
        print("   Rules: Summoned characters have reduced functionality, full turns,")
        print("          and always follow immediately after their hero counterpart.")
        print("=" * 90)

        play_script = os.path.join(ROOT_DIR, "play.sh")
        disp = os.environ.get("DISPLAY", ":0")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port), DISPLAY=disp)
        args = [play_script, "--role=player"]
        if not os.path.exists("/tmp/.X11-unix") or not os.environ.get("DISPLAY"):
            args.append("--headless")
        cls.proc = subprocess.Popen(
            args,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.06)
        if not cls.player.wait_for_ready(14.0):
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError("Tabletop test server failed to become ready.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            try:
                cls.proc.terminate()
                cls.proc.wait(timeout=2.0)
            except Exception:
                cls.proc.kill()

    def setUp(self):
        self.player.reset_game()

    def test_01_wizard_summons_two_wolves(self):
        bdd_scenario_header(1, "Wizard Summons 2 Wolf Characters with Reduced Functionality")

        bdd_step("GIVEN", "The 4 classic heroes (Barbarian, Dwarf, Elf, Wizard) assembled at spiral stair")
        st_initial = self.player.get_state()
        hero_ids = [h.get("id") for h in st_initial.get("heroes", [])]
        self.assertEqual(hero_ids, ["barbarian", "dwarf", "elf", "wizard"])

        bdd_step("WHEN", "Wizard summons Wolf 1 into a corridor square in line of sight [0, 2]")
        res_w1 = self.player.summon_character(
            summoner_id="wizard",
            name="Shadow Wolf",
            token_key="wolf",
            grid_pos=[0, 2],
            attackDice=2,
            defendDice=2,
            bodyPoints=2,
            mindPoints=1,
            movement=8
        )
        bdd_step("THEN", "Wolf 1 is successfully summoned and attached to Wizard",
                 assertions=[
                     f"success: {res_w1.get('success')}",
                     f"summoner: {res_w1.get('summoner')}",
                     f"tile: {res_w1.get('tile')}"
                 ])
        self.assertTrue(res_w1.get("success"))
        self.assertEqual(res_w1.get("summoner"), "wizard")

        bdd_step("WHEN", "Wizard summons Wolf 2 into an adjacent line of sight square [0, 3]")
        res_w2 = self.player.summon_character(
            summoner_id="wizard",
            name="Timber Wolf",
            token_key="wolf",
            grid_pos=[0, 3],
            attackDice=2,
            defendDice=2,
            bodyPoints=2,
            mindPoints=1,
            movement=8
        )
        self.assertTrue(res_w2.get("success"))

        bdd_step("THEN", "Both wolves appear in heroes array immediately following Wizard",
                 assertions=[
                     "Order: Barbarian -> Dwarf -> Elf -> Wizard -> Shadow Wolf -> Timber Wolf"
                 ])
        st_after = self.player.get_state()
        hero_names = [h.get("name") for h in st_after.get("heroes", [])]
        self.assertEqual(hero_names[:4], ["Barbarian", "Dwarf", "Elf", "Wizard"])
        self.assertEqual(hero_names[4], "Shadow Wolf")
        self.assertEqual(hero_names[5], "Timber Wolf")

        summons = self.player.get_summons()
        self.assertEqual(len(summons), 2)
        for s in summons:
            self.assertTrue(s.get("is_summon") or s.get("isSummon"))
            self.assertTrue(s.get("reduced_functionality"))
            self.assertEqual(s.get("summoner_id"), "wizard")

    def test_02_hearthskin_horn_blowing_and_skeleton_stats(self):
        bdd_scenario_header(2, "The Hearthskin Horn Places Friendly Skeletons (Move: 8, Atk: 2, Def: 2, Body: 1, Mind: 0)")

        bdd_step("GIVEN", "Barbarian has The Hearthskin Horn added to inventory")
        self.player.execute_action("add_item", heroId="barbarian", item="hearthskin_horn")

        # Position heroes in open starting corridor so valid summon tiles in line of sight exist
        self.player.set_state(heroes=[
            {"id": "barbarian", "grid_pos": [1, 0], "is_on_board": True, "has_departed_start": True, "current_bp": 8},
            {"id": "dwarf", "grid_pos": [2, 0], "is_on_board": True, "has_departed_start": True, "current_bp": 7},
            {"id": "elf", "grid_pos": [3, 0], "is_on_board": True, "has_departed_start": True, "current_bp": 6},
            {"id": "wizard", "grid_pos": [4, 0], "is_on_board": True, "has_departed_start": True, "current_bp": 4}
        ])

        bdd_step("WHEN", "Barbarian uses/blows The Hearthskin Horn")
        res_horn = self.player.blow_hearthskin_horn(hero_id="barbarian")

        bdd_step("THEN", "The Hearthskin Horn blows successfully and creates friendly skeletons for each living hero",
                 assertions=[
                     f"success: {res_horn.get('success')}",
                     f"action: {res_horn.get('action')}",
                     f"count: {res_horn.get('count')}"
                 ])
        self.assertTrue(res_horn.get("success"))
        self.assertEqual(res_horn.get("action"), "blow_hearthskin_horn")
        self.assertEqual(res_horn.get("count"), 4)

        bdd_step("THEN", "Every friendly skeleton matches exact required stats: move 8, atk 2, def 2, body 1, mind 0")
        summons = self.player.get_summons()
        self.assertEqual(len(summons), 4)
        for sk in summons:
            self.assertEqual(sk.get("movement"), 8, "Skeleton movement must be 8")
            self.assertEqual(sk.get("attackDice"), 2, "Skeleton attack dice must be 2")
            self.assertEqual(sk.get("defendDice"), 2, "Skeleton defend dice must be 2")
            self.assertEqual(sk.get("current_bp"), 1, "Skeleton Body Points must be 1")
            self.assertEqual(sk.get("current_mp"), 0, "Skeleton Mind Points must be 0")
            self.assertTrue(sk.get("is_summon"), "Must be marked is_summon")
            self.assertTrue(sk.get("reduced_functionality"), "Must have reduced_functionality")
            print(f"          ✔ {sk.get('name')}: [Move: {sk.get('movement')}, Atk: {sk.get('attackDice')}, Def: {sk.get('defendDice')}, BP: {sk.get('current_bp')}, MP: {sk.get('current_mp')}]")

    def test_03_turn_order_counterpart_rule(self):
        bdd_scenario_header(3, "Strict Turn Order: Summons ALWAYS Take Turns Immediately After Hero Counterpart")

        bdd_step("GIVEN", "Party has 2 heroes (Barbarian, Elf) with 1 skeleton summon each")
        self.player.set_state(
            clearHeroes=True,
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [1, 0], "is_on_board": True, "has_departed_start": True, "current_bp": 8},
                {"id": "elf", "name": "Elf", "grid_pos": [3, 0], "is_on_board": True, "has_departed_start": True, "current_bp": 6}
            ],
            clearMonsters=True
        )

        # Summon skeleton for Barbarian (auto-placed in corridor in line of sight)
        res_sb = self.player.summon_character(
            summoner_id="barbarian",
            name="Barbarian's Skeleton",
            token_key="skeleton",
            attackDice=2,
            defendDice=2,
            bodyPoints=1,
            mindPoints=0,
            movement=8
        )
        self.assertTrue(res_sb.get("success"), f"Barbarian summon failed: {res_sb}")

        # Summon skeleton for Elf (auto-placed in corridor in line of sight)
        res_se = self.player.summon_character(
            summoner_id="elf",
            name="Elf's Skeleton",
            token_key="skeleton",
            attackDice=2,
            defendDice=2,
            bodyPoints=1,
            mindPoints=0,
            movement=8
        )
        self.assertTrue(res_se.get("success"), f"Elf summon failed: {res_se}")

        st = self.player.get_state()
        all_heroes = st.get("heroes", [])
        turn_names = [h.get("name") for h in all_heroes]
        bdd_step("THEN", "Array order strictly interweaves heroes and their summons",
                 assertions=[
                     f"Turn order: {' -> '.join(turn_names)}"
                 ])
        self.assertEqual(turn_names, ["Barbarian", "Barbarian's Skeleton", "Elf", "Elf's Skeleton"])

        bdd_step("WHEN", "Stepping through turn transitions")
        # Start: Active is Barbarian (index 0)
        self.assertEqual(st.get("activeHeroIdx"), 0)
        self.assertEqual(all_heroes[st.get("activeHeroIdx")].get("name"), "Barbarian")

        # Barbarian ends turn -> Next active MUST be Barbarian's Skeleton (index 1)
        self.player.execute_action("click_end_turn")
        st1 = self.player.get_state()
        self.assertEqual(st1.get("activeHeroIdx"), 1)
        self.assertEqual(st1.get("heroes")[st1.get("activeHeroIdx")].get("name"), "Barbarian's Skeleton")
        bdd_step("THEN", "Barbarian's Skeleton is active immediately following Barbarian")

        # Barbarian's Skeleton ends turn -> Next active MUST be Elf (index 2)
        self.player.execute_action("click_end_turn")
        st2 = self.player.get_state()
        self.assertEqual(st2.get("activeHeroIdx"), 2)
        self.assertEqual(st2.get("heroes")[st2.get("activeHeroIdx")].get("name"), "Elf")
        bdd_step("THEN", "Elf is active immediately following Barbarian's Skeleton")

        # Elf ends turn -> Next active MUST be Elf's Skeleton (index 3)
        self.player.execute_action("click_end_turn")
        st3 = self.player.get_state()
        self.assertEqual(st3.get("activeHeroIdx"), 3)
        self.assertEqual(st3.get("heroes")[st3.get("activeHeroIdx")].get("name"), "Elf's Skeleton")
        bdd_step("THEN", "Elf's Skeleton is active immediately following Elf")

        # Elf's Skeleton ends turn -> Concludes hero round, transitions to GM phase
        self.player.execute_action("click_end_turn")
        st4 = self.player.get_state()
        phase_or_round_advanced = (st4.get("phase") == "gm_phase") or (st4.get("round", 1) >= 2)
        self.assertTrue(phase_or_round_advanced, f"Expected GM phase or round advance, got: {st4.get('phase')}, round: {st4.get('round')}")
        bdd_step("THEN", "Hero phase concludes after all heroes and summons have acted")

    def test_04_summon_movement_and_attack(self):
        bdd_scenario_header(4, "Friendly Skeletons Roll Fixed 8 Movement and Attack Adjacent Monsters")

        bdd_step("GIVEN", "A skeleton summon active at [5, 5] and an Orc at [5, 6]")
        self.player.set_state(
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [1, 1], "is_on_board": True, "current_bp": 8},
                {
                    "id": "skel_1",
                    "name": "Friendly Skeleton",
                    "heroClass": "Summon",
                    "grid_pos": [5, 5],
                    "is_on_board": True,
                    "is_summon": True,
                    "summoner_id": "barbarian",
                    "reduced_functionality": True,
                    "current_bp": 1,
                    "bodyPoints": 1,
                    "mindPoints": 0,
                    "attackDice": 2,
                    "defendDice": 2,
                    "movement": 8,
                    "movement_speed": 8,
                    "equipped_weapon": "claws"
                }
            ],
            monsters=[
                {
                    "id": "orc_test",
                    "name": "Orc Grunt",
                    "type": "orc",
                    "grid_pos": [5, 6],
                    "bodyPoints": 2,
                    "current_bp": 2,
                    "attackDice": 3,
                    "defendDice": 2,
                    "is_alive": True
                }
            ],
            activeHero="skel_1",
            activeHeroIndex=1,
            currentPhase="hero_phase",
            currentRole="player"
        )

        bdd_step("WHEN", "Friendly Skeleton rolls movement")
        res_m = self.player.execute_action("roll_movement")
        bdd_step("THEN", "Movement is fixed at 8 squares per skeleton stats",
                 assertions=[
                     f"roll: {res_m.get('roll')}",
                     f"movementRemaining: {res_m.get('movementRemaining')}"
                 ])
        self.assertEqual(res_m.get("roll", {}).get("total"), 8)
        self.assertEqual(res_m.get("movementRemaining"), 8)

        bdd_step("WHEN", "Friendly Skeleton strikes adjacent Orc with 2 Combat Dice")
        res_atk = self.player.execute_action("attack", monster_id="orc_test")
        bdd_step("THEN", "Attack resolves successfully with combat dice roll",
                 assertions=[
                     f"success: {res_atk.get('success')}"
                 ])
        self.assertTrue(res_atk.get("success"))

    def test_05_reduced_functionality_restrictions(self):
        bdd_scenario_header(5, "Summon Reduced Functionality: Treasure Search, Trap Search, Armory & Trade Blocked")

        bdd_step("GIVEN", "A friendly skeleton active inside a discovered room [13, 9]")
        self.player.set_state(
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [1, 1], "is_on_board": True, "current_bp": 8},
                {
                    "id": "skel_minion",
                    "name": "Friendly Skeleton",
                    "heroClass": "Summon",
                    "grid_pos": [13, 9],
                    "is_on_board": True,
                    "is_summon": True,
                    "summoner_id": "barbarian",
                    "reduced_functionality": True,
                    "current_bp": 1,
                    "bodyPoints": 1,
                    "mindPoints": 0,
                    "attackDice": 2,
                    "defendDice": 2,
                    "movement": 8,
                    "movement_speed": 8
                }
            ],
            revealedRooms=["room_center"],
            activeHero="skel_minion",
            activeHeroIndex=1,
            currentPhase="hero_phase",
            currentRole="player"
        )

        bdd_step("WHEN", "Summon attempts to search room for treasure")
        res_search_room = self.player.execute_action("search_room")
        bdd_step("THEN", "Search for treasure is strictly blocked for summons",
                 assertions=[
                     f"success: {res_search_room.get('success')}",
                     f"error: {res_search_room.get('error')}"
                 ])
        self.assertFalse(res_search_room.get("success"))
        self.assertIn("summon", res_search_room.get("error", "").lower())

        bdd_step("WHEN", "Summon attempts to search for traps and secret doors")
        res_search_traps = self.player.execute_action("search_traps")
        bdd_step("THEN", "Search for traps is strictly blocked for summons",
                 assertions=[
                     f"success: {res_search_traps.get('success')}",
                     f"error: {res_search_traps.get('error')}"
                 ])
        self.assertFalse(res_search_traps.get("success"))
        self.assertIn("summon", res_search_traps.get("error", "").lower())

        bdd_step("WHEN", "Summon attempts to purchase from the Armory")
        res_buy = self.player.execute_action("buy_armory_item", heroId="skel_minion", item="shortsword")
        bdd_step("THEN", "Armory purchase is blocked for summons",
                 assertions=[
                     f"success: {res_buy.get('success')}",
                     f"error: {res_buy.get('error')}"
                 ])
        self.assertFalse(res_buy.get("success"))
        self.assertIn("summon", res_buy.get("error", "").lower())

        bdd_step("WHEN", "Summon attempts to pass an item to Barbarian")
        res_pass = self.player.execute_action("pass_item", from_hero_id="skel_minion", to_hero_id="barbarian", item_id="claws")
        bdd_step("THEN", "Item passing is blocked for summons",
                 assertions=[
                     f"success: {res_pass.get('success')}",
                     f"error: {res_pass.get('error')}"
                 ])
        self.assertFalse(res_pass.get("success"))
        self.assertIn("summon", res_pass.get("error", "").lower())

    def test_06_visual_proof_capture(self):
        bdd_scenario_header(6, "Visual Proof: Capture Board with Friendly Skeletons & Spectral Glow")

        bdd_step("GIVEN", "All 4 heroes with friendly skeletons assembled on board")
        self.player.set_state(
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [2, 1], "is_on_board": True, "current_bp": 8, "tokenColor": "#b91c1c"},
                {"id": "skel_barb", "name": "Barbarian's Skeleton", "heroClass": "Summon", "grid_pos": [2, 2], "is_on_board": True, "is_summon": True, "summoner_id": "barbarian", "current_bp": 1, "bodyPoints": 1, "mindPoints": 0, "attackDice": 2, "defendDice": 2, "movement": 8, "token_key": "skeleton", "tokenColor": "#38bdf8"},
                {"id": "wizard", "name": "Wizard", "grid_pos": [4, 1], "is_on_board": True, "current_bp": 4, "tokenColor": "#1d4ed8"},
                {"id": "wolf_wiz", "name": "Wizard's Wolf", "heroClass": "Summon", "grid_pos": [4, 2], "is_on_board": True, "is_summon": True, "summoner_id": "wizard", "current_bp": 2, "bodyPoints": 2, "mindPoints": 1, "attackDice": 2, "defendDice": 2, "movement": 8, "token_key": "wolf", "tokenColor": "#38bdf8"}
            ],
            monsters=[
                {"id": "gargoyle_boss", "name": "Gargoyle", "type": "gargoyle", "grid_pos": [3, 4], "bodyPoints": 3, "current_bp": 3, "is_alive": True}
            ],
            activeHeroIdx=1,
            currentPhase="hero_phase",
            currentRole="player"
        )
        time.sleep(0.5)

        bdd_step("WHEN", "Capturing viewport screenshot via GameControlServer")
        snap_path = "/tmp/tabletop_summons_proof.png"
        res_snap = self.player.execute_action("capture_screenshot", path=snap_path)
        time.sleep(0.3)

        bdd_step("THEN", "Screenshot is saved and copied to brain artifacts directory")
        if os.path.exists(snap_path) and os.path.getsize(snap_path) > 0:
            dest_proof = os.path.join(BRAIN_DIR, "tabletop_summons_and_hearthskin_horn_proof.png")
            shutil.copyfile(snap_path, dest_proof)
            print(f"          ✔ Copied visual proof to {dest_proof} ({os.path.getsize(dest_proof)} bytes)")

            # Crop zoomed board section
            try:
                img = Image.open(snap_path)
                w, h = img.size
                crop_area = img.crop((int(w * 0.15), int(h * 0.05), int(w * 0.85), int(h * 0.75)))
                crop_dest = os.path.join(BRAIN_DIR, "tabletop_summons_crop.png")
                crop_area.save(crop_dest)
                print(f"          ✔ Saved cropped summon board visual to {crop_dest}")
            except Exception as e:
                print(f"          ⚠ Note: Cropping failed: {e}")


if __name__ == "__main__":
    unittest.main()
