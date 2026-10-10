#!/usr/bin/env python3
"""
test_special_furniture_treasure_e2e.py
End-to-End BDD test suite verifying special furniture rules during treasure searching:

1. Healing Hearth (1x3 tile furniture):
   - When searching for treasure in a room containing a Healing Hearth, the hero
     is given the option to heal 1 Body Point if applicable (current_bp < max_bp).
   - When claimed, hero heals +1 BP (capped at max BP), logs combat log entry, and spawns floating text.
   - If hero is at full health, healing option is not applicable.
   - A hero can only claim hearth healing once per treasure search.

2. Sly Storage:
   - When a room contains Sly Storage, each hero is allowed 2 cards per hero
     (each hero may search the room up to 2 times instead of standard 1-search limit).
   - Hotbar Search Room remains available for that hero's 2nd search.
   - On the 3rd search attempt by the same hero, search is rejected.
   - Multiple heroes can each independently search up to 2 times.
   - Interactive modal offers button to draw the second card immediately.
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


class TestSpecialFurnitureTreasureE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18108

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🏛️ SPECIAL FURNITURE TREASURE SEARCH RULES E2E TEST SUITE")
        print("=" * 90)
        cls.play_script = os.path.join(GAME_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(30):
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
        time.sleep(0.2)

    def test_01_healing_hearth_offers_option_to_wounded_hero(self):
        """Rule: If a room contains a Healing Hearth (1x3 tile), searching for treasure gives the option to heal 1 BP."""
        print("\n=====================================================================================")
        print("🎲 TEST 01: Healing Hearth Offers +1 BP Option to Wounded Hero")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is inside room-nw-crypt at (4, 3) with 5 of 8 Body Points")
        bdd_step("AND", "Chamber contains a 1x3 Healing Hearth at (3, 2)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "barbarian",
                "characterName": "Barbarian",
                "grid_pos": [4, 3],
                "current_bp": 5,
                "bodyPoints": 8,
                "gold": 0
            }],
            furniture=[{
                "id": "hearth-crypt",
                "type": "healing_hearth",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 3,
                "roomId": "room-nw-crypt"
            }],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian searches the room for treasure with interactive=True")
        res = self.ai.search(interactive=True)
        self.assertTrue(res.get("success"), f"Search failed: {res}")

        overlay = self.ai.get_treasure_overlay()
        bdd_step("THEN", "Treasure overlay exposes Healing Hearth availability",
                 assertions=[
                     f"Overlay active: {overlay.get('active')}",
                     f"hasHealingHearth: {overlay.get('hasHealingHearth')}",
                     f"healingHearthAvailable: {overlay.get('healingHearthAvailable')}",
                     f"healingHearthUsed: {overlay.get('healingHearthUsed')}"
                 ])
        self.assertTrue(overlay.get("hasHealingHearth"))
        self.assertTrue(overlay.get("healingHearthAvailable"))
        self.assertFalse(overlay.get("healingHearthUsed"))

        bdd_step("WHEN", "Barbarian claims the Healing Hearth restoration (+1 BP)")
        heal_res = self.ai.claim_hearth_heal()
        bdd_step("THEN", "Healing Hearth grants +1 BP and records log",
                 assertions=[
                     f"Claim heal success: {heal_res.get('success')}",
                     f"Healed amount: {heal_res.get('healed')}",
                     f"Updated current_bp: {heal_res.get('current_bp')}"
                 ])
        self.assertTrue(heal_res.get("success"))
        self.assertEqual(heal_res.get("healed"), 1)
        self.assertEqual(heal_res.get("current_bp"), 6)

        st = self.ai.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        self.assertEqual(barb.get("current_bp"), 6)

        bdd_step("WHEN", "Barbarian attempts to claim hearth heal a second time for the same search")
        heal_again = self.ai.claim_hearth_heal()
        bdd_step("THEN", "Second claim is rejected",
                 assertions=[
                     f"Success: {heal_again.get('success')}",
                     f"Error: {heal_again.get('error')}"
                 ])
        self.assertFalse(heal_again.get("success"))

        self.ai.dismiss_treasure_overlay()

    def test_02_healing_hearth_not_applicable_at_full_health(self):
        """Rule: Healing Hearth option is not applicable if the hero is already at maximum Body Points."""
        print("\n=====================================================================================")
        print("🎲 TEST 02: Healing Hearth Not Applicable When Hero is at Full Health")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is inside room-nw-crypt at full health (8/8 BP)")
        bdd_step("AND", "Chamber contains a Healing Hearth")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "barbarian",
                "characterName": "Barbarian",
                "grid_pos": [4, 3],
                "current_bp": 8,
                "bodyPoints": 8,
                "gold": 0
            }],
            furniture=[{
                "id": "hearth-crypt",
                "type": "healing_hearth",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 3,
                "roomId": "room-nw-crypt"
            }],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian searches the room with interactive=True")
        res = self.ai.search(interactive=True)
        self.assertTrue(res.get("success"))

        overlay = self.ai.get_treasure_overlay()
        bdd_step("THEN", "healingHearthAvailable is False because hero is at max HP",
                 assertions=[
                     f"hasHealingHearth: {overlay.get('hasHealingHearth')}",
                     f"healingHearthAvailable: {overlay.get('healingHearthAvailable')}"
                 ])
        self.assertTrue(overlay.get("hasHealingHearth"))
        self.assertFalse(overlay.get("healingHearthAvailable"))

        bdd_step("WHEN", "Barbarian attempts to invoke claim_hearth_heal")
        claim_res = self.ai.claim_hearth_heal()
        bdd_step("THEN", "Claim is cleanly rejected because hero is at maximum BP",
                 assertions=[
                     f"Success: {claim_res.get('success')}",
                     f"Error: {claim_res.get('error')}"
                 ])
        self.assertFalse(claim_res.get("success"))
        self.assertIn("maximum", claim_res.get("error", "").lower())

        self.ai.dismiss_treasure_overlay()

    def test_03_sly_storage_allows_two_cards_per_hero(self):
        """Rule: A room with Sly Storage allows each hero to search up to 2 times (2 cards per hero)."""
        print("\n=====================================================================================")
        print("🎲 TEST 03: Sly Storage Allows 2 Cards / Searches Per Hero")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian is inside room-nw-crypt containing Sly Storage")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "barbarian",
                "characterName": "Barbarian",
                "grid_pos": [4, 3],
                "gold": 0
            }],
            furniture=[{
                "id": "sly-chest",
                "type": "sly_storage",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 1,
                "roomId": "room-nw-crypt"
            }],
            treasureDeck=[
                {"id": "gem-50", "type": "gold", "title": "50 Gold Gem", "gold": 50},
                {"id": "gold-25", "type": "gold", "title": "25 Gold Coins", "gold": 25}
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Barbarian searches room for the 1st time")
        res1 = self.ai.search()
        bdd_step("THEN", "First search succeeds, tracking Sly Storage rules",
                 assertions=[
                     f"Search 1 success: {res1.get('success')}",
                     f"slyStorage: {res1.get('slyStorage')}",
                     f"heroSearches: {res1.get('heroSearches')}",
                     f"remainingSearchesForHero: {res1.get('remainingSearchesForHero')}"
                 ])
        self.assertTrue(res1.get("success"))
        self.assertTrue(res1.get("slyStorage"))
        self.assertEqual(res1.get("heroSearches"), 1)
        self.assertEqual(res1.get("remainingSearchesForHero"), 1)

        bdd_step("GIVEN", "Barbarian resets action for next turn in the same room")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            preserveSearchedRooms=True
        )

        bdd_step("WHEN", "Barbarian searches room for the 2nd time")
        res2 = self.ai.search()
        bdd_step("THEN", "Second search SUCCEEDS because Sly Storage allows 2 cards per hero",
                 assertions=[
                     f"Search 2 success: {res2.get('success')}",
                     f"heroSearches: {res2.get('heroSearches')}",
                     f"remainingSearchesForHero: {res2.get('remainingSearchesForHero')}"
                 ])
        self.assertTrue(res2.get("success"))
        self.assertEqual(res2.get("heroSearches"), 2)
        self.assertEqual(res2.get("remainingSearchesForHero"), 0)

        st = self.ai.get_state()
        searched = st.get("searchedRooms", {}).get("room-nw-crypt", [])
        self.assertEqual(searched.count("barbarian"), 2)

        bdd_step("GIVEN", "Barbarian resets action for another turn in the same room")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            preserveSearchedRooms=True
        )

        bdd_step("WHEN", "Barbarian attempts a 3rd search in the same room")
        res3 = self.ai.search()
        bdd_step("THEN", "Third search is REJECTED because Barbarian reached the 2-card limit",
                 assertions=[
                     f"Search 3 success: {res3.get('success')}",
                     f"Error: {res3.get('error')}"
                 ])
        self.assertFalse(res3.get("success"))
        self.assertIn("already searched", res3.get("error", "").lower())

    def test_04_sly_storage_allows_each_hero_two_cards(self):
        """Rule: Different heroes can each search up to 2 times in a room with Sly Storage."""
        print("\n=====================================================================================")
        print("🎲 TEST 04: Multiple Heroes Can Each Draw 2 Cards from Sly Storage")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian has already searched Northwest Crypt twice")
        bdd_step("AND", "Dwarf enters the chamber at (3, 3)")
        self.ai.set_state(
            activeHero="dwarf",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "characterName": "Barbarian", "grid_pos": [4, 3], "gold": 0},
                {"id": "dwarf", "characterName": "Dwarf", "grid_pos": [3, 3], "gold": 0}
            ],
            searchedRooms={"room-nw-crypt": ["barbarian", "barbarian"]},
            furniture=[{
                "id": "sly-chest",
                "type": "sly_storage",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 1,
                "roomId": "room-nw-crypt"
            }],
            treasureDeck=[
                {"id": "gem-50", "type": "gold", "title": "50 Gold Gem", "gold": 50},
                {"id": "gold-25", "type": "gold", "title": "25 Gold Coins", "gold": 25}
            ],
            monsters=[]
        )

        bdd_step("WHEN", "Dwarf performs first search in the room")
        d_res1 = self.ai.search()
        bdd_step("THEN", "Dwarf's first search succeeds",
                 assertions=[
                     f"Dwarf search 1 success: {d_res1.get('success')}",
                     f"heroSearches: {d_res1.get('heroSearches')}"
                 ])
        self.assertTrue(d_res1.get("success"))
        self.assertEqual(d_res1.get("heroSearches"), 1)

        bdd_step("GIVEN", "Dwarf resets action for next turn")
        self.ai.set_state(
            activeHero="dwarf",
            hasActed=False,
            preserveSearchedRooms=True
        )

        bdd_step("WHEN", "Dwarf performs second search in the room")
        d_res2 = self.ai.search()
        bdd_step("THEN", "Dwarf's second search succeeds (2 cards obtained)",
                 assertions=[
                     f"Dwarf search 2 success: {d_res2.get('success')}",
                     f"heroSearches: {d_res2.get('heroSearches')}"
                 ])
        self.assertTrue(d_res2.get("success"))
        self.assertEqual(d_res2.get("heroSearches"), 2)

        st = self.ai.get_state()
        room_searches = st.get("searchedRooms", {}).get("room-nw-crypt", [])
        self.assertEqual(room_searches.count("barbarian"), 2)
        self.assertEqual(room_searches.count("dwarf"), 2)
        self.assertEqual(len(room_searches), 4)

        bdd_step("GIVEN", "Dwarf resets action for another turn")
        self.ai.set_state(
            activeHero="dwarf",
            hasActed=False,
            preserveSearchedRooms=True
        )

        bdd_step("WHEN", "Dwarf attempts a 3rd search in the same room")
        d_res3 = self.ai.search()
        bdd_step("THEN", "Dwarf's 3rd search is rejected",
                 assertions=[
                     f"Dwarf search 3 success: {d_res3.get('success')}",
                     f"Error: {d_res3.get('error')}"
                 ])
        self.assertFalse(d_res3.get("success"))

    def test_05_sly_storage_draw_second_treasure_card_interactive(self):
        """Rule: Interactive search modal provides immediate 'Search Sly Storage (Card 2/2)' button."""
        print("\n=====================================================================================")
        print("🎲 TEST 05: Immediate Dual-Card Draw via Modal in Sly Storage Room")
        print("=====================================================================================")

        bdd_step("GIVEN", "Elf is inside a chamber with Sly Storage")
        self.ai.set_state(
            activeHero="elf",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "elf",
                "characterName": "Elf",
                "grid_pos": [4, 3],
                "gold": 0
            }],
            treasureDeck=[
                {"id": "gem-50", "type": "gold", "title": "50 Gold Gem", "gold": 50},
                {"id": "gold-25", "type": "gold", "title": "25 Gold Coins", "gold": 25}
            ],
            furniture=[{
                "id": "sly-storage-box",
                "type": "sly_storage",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 1,
                "roomId": "room-nw-crypt"
            }],
            monsters=[]
        )

        bdd_step("WHEN", "Elf searches room with interactive=True")
        res1 = self.ai.search(interactive=True)
        self.assertTrue(res1.get("success"))

        overlay1 = self.ai.get_treasure_overlay()
        bdd_step("THEN", "Modal displays Card 1 and flags Sly Storage in room",
                 assertions=[
                     f"slyStorageInRoom: {overlay1.get('slyStorageInRoom')}",
                     f"heroSearchCount: {overlay1.get('heroSearchCount')}",
                     f"maxSearchesPerHero: {overlay1.get('maxSearchesPerHero')}"
                 ])
        self.assertTrue(overlay1.get("slyStorageInRoom"))
        self.assertEqual(overlay1.get("heroSearchCount"), 1)
        self.assertEqual(overlay1.get("maxSearchesPerHero"), 2)

        bdd_step("WHEN", "Elf clicks draw_second_treasure_card() from modal")
        res2 = self.ai.draw_second_treasure_card()
        self.assertTrue(res2.get("success"))

        overlay2 = self.ai.get_treasure_overlay()
        bdd_step("THEN", "Modal updates to display Card 2 (heroSearchCount=2)",
                 assertions=[
                     f"slyStorageInRoom: {overlay2.get('slyStorageInRoom')}",
                     f"heroSearchCount: {overlay2.get('heroSearchCount')}"
                 ])
        self.assertEqual(overlay2.get("heroSearchCount"), 2)

        self.ai.dismiss_treasure_overlay()

        st = self.ai.get_state()
        room_searches = st.get("searchedRooms", {}).get("room-nw-crypt", [])
        self.assertEqual(room_searches.count("elf"), 2)

    def test_06_healing_hearth_claim_during_overlay_dismiss(self):
        """Rule: Wounded hero can claim healing hearth rest while dismissing the treasure overlay."""
        print("\n=====================================================================================")
        print("🎲 TEST 06: Healing Hearth Claimed Directly in Overlay Dismiss RPC")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian with 6/8 BP searches in room with Healing Hearth")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{
                "id": "barbarian",
                "characterName": "Barbarian",
                "grid_pos": [4, 3],
                "current_bp": 6,
                "bodyPoints": 8,
                "gold": 0
            }],
            furniture=[{
                "id": "hearth-crypt",
                "type": "healing_hearth",
                "x": 3,
                "y": 2,
                "width": 1,
                "height": 3,
                "roomId": "room-nw-crypt"
            }],
            monsters=[]
        )

        res = self.ai.search(interactive=True)
        self.assertTrue(res.get("success"))

        bdd_step("WHEN", "Barbarian dismisses overlay with claim_hearth_heal=True")
        self.ai.dismiss_treasure_overlay(claim_hearth_heal=True)

        st = self.ai.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        bdd_step("THEN", "Barbarian healed +1 BP (6 -> 7 BP)",
                 assertions=[
                     f"Current BP: {barb.get('current_bp')}"
                 ])
        self.assertEqual(barb.get("current_bp"), 7)


if __name__ == "__main__":
    unittest.main()
