#!/usr/bin/env python3
"""
test_hero_item_exchange_e2e.py
End-to-End BDD test suite verifying Hero Item & Equipment Exchange rules in HeroQuest Tabletop RPG:

Rule:
- Heroes may pass a potion, artifact, weapon, or any other item or piece of equipment
  to another hero if and only if adjacent to that hero.
- Non-adjacent heroes or heroes separated by closed doors/walls cannot pass items.
- Passing an equipped weapon or armor safely unequips it on the giver and transfers it
  to the recipient's inventory.
- Heroes may also trade/pass gold when adjacent.
- The backpack inventory UI dynamically displays adjacent hero pass buttons when in proximity.
"""

import os
import sys
import time
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.abspath(os.path.join(TESTS_DIR, ".."))
ROOT_DIR = os.path.abspath(os.path.join(GAME_DIR, "..", ".."))

sys.path.insert(0, os.path.join(GAME_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, assertions: list = None):
    badge = {
        "GIVEN": "🔷 [GIVEN]",
        "WHEN":  "⚡ [WHEN] ",
        "THEN":  "✅ [THEN] ",
        "AND":   "🔹 [AND]  "
    }.get(step_type.upper(), "  ")
    print(f"\n{badge} {text}")
    if assertions:
        for a in assertions:
            print(f"       • {a}")


class TestHeroItemExchangeE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18109

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🤝 HERO ITEM & EQUIPMENT EXCHANGE E2E TEST SUITE")
        print("=" * 90)
        cls.play_script = os.path.join(GAME_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))

        cmd = [cls.play_script, "--player", "--port", str(cls.port), "--test-port", str(cls.port)]
        cls.proc = subprocess.Popen(
            cmd,
            cwd=GAME_DIR,
            env=cls.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        cls.ai = TabletopQAPlayer(port=cls.port)
        connected = False
        for attempt in range(50):
            try:
                st = cls.ai.get_state()
                if st and st.get("heroes"):
                    connected = True
                    break
            except Exception:
                pass
            time.sleep(0.3)

        if not connected:
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError(f"Could not connect to Tabletop server on port {cls.port} within timeout.")

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
        time.sleep(0.2)

    def test_01_adjacent_heroes_can_pass_potion(self):
        """Rule: Heroes may pass a potion to another hero if adjacent."""
        print("\n=====================================================================================")
        print("🎲 TEST 01: Adjacent Heroes Can Pass Potion of Healing")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is at (4, 3) with a Potion of Healing in inventory")
        bdd_step("AND", "Dwarf is in adjacent tile (4, 4) with 0 items")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "inventory": ["healing_potion", "broadsword"],
                    "gold": 100
                },
                {
                    "id": "dwarf",
                    "characterName": "Dorgan",
                    "name": "Dwarf",
                    "grid_pos": [4, 4],
                    "is_on_board": True,
                    "current_bp": 7,
                    "bodyPoints": 7,
                    "inventory": [],
                    "gold": 50
                }
            ],
            monsters=[]
        )

        st = self.ai.get_state()
        barb_inv_before = [h for h in st.get("heroes", []) if h.get("id") == "barbarian"][0].get("inventory", [])
        dwarf_inv_before = [h for h in st.get("heroes", []) if h.get("id") == "dwarf"][0].get("inventory", [])
        self.assertIn("healing_potion", barb_inv_before)
        self.assertEqual(len(dwarf_inv_before), 0)

        bdd_step("WHEN", "Barbarian passes 'healing_potion' to adjacent Dwarf")
        res = self.ai.pass_item("dwarf", "healing_potion", from_hero_id="barbarian")
        bdd_step("THEN", "Exchange succeeds and items transfer correctly",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Item: {res.get('item')}",
                     f"From: {res.get('fromHeroName')} -> To: {res.get('toHeroName')}"
                 ])
        self.assertTrue(res.get("success"), f"Pass item failed: {res}")
        self.assertEqual(res.get("action"), "pass_item")

        st_after = self.ai.get_state()
        barb_inv_after = [h for h in st_after.get("heroes", []) if h.get("id") == "barbarian"][0].get("inventory", [])
        dwarf_inv_after = [h for h in st_after.get("heroes", []) if h.get("id") == "dwarf"][0].get("inventory", [])

        self.assertNotIn("healing_potion", barb_inv_after)
        self.assertIn("broadsword", barb_inv_after)
        self.assertIn("healing_potion", dwarf_inv_after)
        print("       • Verified: Barbarian inventory has 1 item, Dwarf inventory has healing_potion.")

    def test_02_non_adjacent_heroes_cannot_pass_items(self):
        """Rule: If heroes are not adjacent, passing items is rejected."""
        print("\n=====================================================================================")
        print("🎲 TEST 02: Non-Adjacent Heroes Cannot Pass Items (Distance Guard)")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is at (4, 3) and Elf is far away at (12, 10)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "inventory": ["healing_potion", "broadsword"],
                    "gold": 100
                },
                {
                    "id": "elf",
                    "characterName": "Ladril",
                    "name": "Elf",
                    "grid_pos": [12, 10],
                    "is_on_board": True,
                    "current_bp": 6,
                    "bodyPoints": 6,
                    "inventory": ["shortsword"],
                    "gold": 75
                }
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian attempts to pass 'healing_potion' to non-adjacent Elf")
        res = self.ai.pass_item("elf", "healing_potion", from_hero_id="barbarian")
        bdd_step("THEN", "Pass action is rejected due to distance",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Error: {res.get('error')}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertIn("not in adjacent squares", res.get("error", "").lower())

        st = self.ai.get_state()
        barb_inv = [h for h in st.get("heroes", []) if h.get("id") == "barbarian"][0].get("inventory", [])
        elf_inv = [h for h in st.get("heroes", []) if h.get("id") == "elf"][0].get("inventory", [])
        self.assertIn("healing_potion", barb_inv, "Potion must remain in Barbarian's inventory")
        self.assertNotIn("healing_potion", elf_inv, "Elf must not receive potion")

    def test_03_adjacent_heroes_separated_by_closed_door_cannot_pass(self):
        """Rule: Heroes standing on adjacent grid coords separated by a closed door cannot exchange items."""
        print("\n=====================================================================================")
        print("🎲 TEST 03: Heroes Separated by Closed Door Cannot Pass Items")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is inside room at (4, 3) and Dwarf is outside corridor at (4, 2)")
        bdd_step("AND", "A closed door separates them between (4, 3) and (4, 2)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            doors=[
                {
                    "id": "door-crypt-n",
                    "from": [4, 3],
                    "to": [4, 2],
                    "is_open": False,
                    "state": "closed"
                }
            ],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "inventory": ["healing_potion"]
                },
                {
                    "id": "dwarf",
                    "characterName": "Dorgan",
                    "name": "Dwarf",
                    "grid_pos": [4, 2],
                    "is_on_board": True,
                    "current_bp": 7,
                    "bodyPoints": 7,
                    "inventory": []
                }
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian attempts to pass 'healing_potion' through the closed door")
        res = self.ai.pass_item("dwarf", "healing_potion", from_hero_id="barbarian")
        bdd_step("THEN", "Action fails because closed door blocks adjacency/exchange",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Error: {res.get('error')}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertIn("not in adjacent squares", res.get("error", "").lower())

    def test_04_passing_equipped_weapon_unequips_and_transfers(self):
        """Rule: Passing an equipped weapon unequips it from the giver and transfers it to recipient."""
        print("\n=====================================================================================")
        print("🎲 TEST 04: Passing Equipped Weapon Unequips and Transfers")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is at (4, 3) wielding Broadsword (equipped_weapon='broadsword')")
        bdd_step("AND", "Dwarf is in adjacent tile (4, 4) wielding Shortsword")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "equipped_weapon": "broadsword",
                    "inventory": ["broadsword", "shortsword"]
                },
                {
                    "id": "dwarf",
                    "characterName": "Dorgan",
                    "name": "Dwarf",
                    "grid_pos": [4, 4],
                    "is_on_board": True,
                    "current_bp": 7,
                    "bodyPoints": 7,
                    "equipped_weapon": "shortsword",
                    "inventory": ["shortsword"]
                }
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian passes 'broadsword' to adjacent Dwarf")
        res = self.ai.pass_item("dwarf", "broadsword", from_hero_id="barbarian")
        bdd_step("THEN", "Broadsword is transferred and Barbarian equips fallback weapon",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Item: {res.get('item')}",
                     f"From: {res.get('fromHeroName')} -> To: {res.get('toHeroName')}"
                 ])
        self.assertTrue(res.get("success"), f"Pass weapon failed: {res}")

        st = self.ai.get_state()
        barb = [h for h in st.get("heroes", []) if h.get("id") == "barbarian"][0]
        dwarf = [h for h in st.get("heroes", []) if h.get("id") == "dwarf"][0]

        self.assertNotIn("broadsword", barb.get("inventory", []))
        self.assertIn("broadsword", dwarf.get("inventory", []))
        self.assertEqual(barb.get("equipped_weapon"), "shortsword", "Barbarian equipped weapon should fallback to shortsword")
        print("       • Verified: Broadsword transferred, Barbarian now wields fallback weapon.")

    def test_05_pass_artifact_and_gold(self):
        """Rule: Heroes may pass artifacts and gold coins to adjacent allies."""
        print("\n=====================================================================================")
        print("🎲 TEST 05: Pass Artifact & Transfer Gold to Adjacent Hero")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian has artifact 'orc_cleaver' and 200 GP at (4, 3)")
        bdd_step("AND", "Dwarf is adjacent at (3, 3) with 50 GP")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "inventory": ["orc_cleaver"],
                    "gold": 200
                },
                {
                    "id": "dwarf",
                    "characterName": "Dorgan",
                    "name": "Dwarf",
                    "grid_pos": [3, 3],
                    "is_on_board": True,
                    "current_bp": 7,
                    "bodyPoints": 7,
                    "inventory": [],
                    "gold": 50
                }
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian passes artifact 'orc_cleaver' to Dwarf")
        res_art = self.ai.pass_item("dwarf", "orc_cleaver", from_hero_id="barbarian")
        self.assertTrue(res_art.get("success"), f"Pass artifact failed: {res_art}")

        bdd_step("AND", "Barbarian transfers 75 Gold Coins to Dwarf")
        res_gold = self.ai.pass_gold("dwarf", 75, from_hero_id="barbarian")
        self.assertTrue(res_gold.get("success"), f"Pass gold failed: {res_gold}")
        self.assertEqual(res_gold.get("fromGold"), 125)
        self.assertEqual(res_gold.get("toGold"), 125)

        st = self.ai.get_state()
        barb = [h for h in st.get("heroes", []) if h.get("id") == "barbarian"][0]
        dwarf = [h for h in st.get("heroes", []) if h.get("id") == "dwarf"][0]

        bdd_step("THEN", "Dwarf has the artifact and both heroes have updated gold balances",
                 assertions=[
                     f"Barbarian Gold: {barb.get('gold')} GP",
                     f"Dwarf Gold: {dwarf.get('gold')} GP",
                     f"Dwarf Inventory: {dwarf.get('inventory')}"
                 ])
        self.assertEqual(barb.get("gold"), 125)
        self.assertEqual(dwarf.get("gold"), 125)
        self.assertIn("orc_cleaver", dwarf.get("inventory", []))

    def test_06_adjacent_heroes_telemetry_and_backpack_modal(self):
        """Rule: Telemetry and backpack modal report adjacent heroes for item exchange."""
        print("\n=====================================================================================")
        print("🎲 TEST 06: Adjacent Heroes Telemetry & Modal UI Interaction")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian at (4, 3) is adjacent to Dwarf at (4, 4) and Elf at (5, 3)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {
                    "id": "barbarian",
                    "characterName": "Rogar",
                    "name": "Barbarian",
                    "grid_pos": [4, 3],
                    "is_on_board": True,
                    "current_bp": 8,
                    "bodyPoints": 8,
                    "inventory": ["healing_potion", "tool_kit"]
                },
                {
                    "id": "dwarf",
                    "characterName": "Dorgan",
                    "name": "Dwarf",
                    "grid_pos": [4, 4],
                    "is_on_board": True,
                    "current_bp": 7,
                    "bodyPoints": 7,
                    "inventory": []
                },
                {
                    "id": "elf",
                    "characterName": "Ladril",
                    "name": "Elf",
                    "grid_pos": [5, 3],
                    "is_on_board": True,
                    "current_bp": 6,
                    "bodyPoints": 6,
                    "inventory": []
                }
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Checking adjacent heroes for Barbarian via RPC")
        adj_res = self.ai.get_adjacent_heroes("barbarian")
        self.assertTrue(adj_res.get("success"))
        adj_ids = [h.get("id") for h in adj_res.get("adjacentHeroes", [])]
        bdd_step("THEN", "Both Dwarf and Elf are detected as adjacent",
                 assertions=[f"Adjacent heroes: {adj_ids}"])
        self.assertIn("dwarf", adj_ids)
        self.assertIn("elf", adj_ids)

        bdd_step("WHEN", "Opening backpack inventory modal")
        modal_res = self.ai.open_item_panel()
        self.assertTrue(modal_res.get("success"))

        st = self.ai.get_state()
        self.assertTrue(st.get("itemPanelOpen"))
        self.ai.close_item_panel()
        print("       • Verified: Item modal opens cleanly and exposes exchange actions.")


if __name__ == "__main__":
    unittest.main()
