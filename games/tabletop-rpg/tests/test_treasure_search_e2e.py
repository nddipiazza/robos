#!/usr/bin/env python3
"""
test_treasure_search_e2e.py
Comprehensive End-to-End BDD test suite verifying authentic HeroQuest room treasure searching:
1. Uninhabited Rooms: Heroes can only search a chamber if no living monsters are present in that exact room.
2. Once Per Room: Each room can be searched once per hero (up to 4 searches total), tracked per room ID.
3. No Searching in Corridors: Searching in corridors or hallways is strictly forbidden.
4. Quest Notes (Scripted Room Treasure): The first search in a chamber with noted quest treasure awards the
   specific story treasure (gold chest, potion, relic).
5. The Treasure Deck: Subsequent room searches (or searches in rooms without quest notes) draw a card from
   the authentic Treasure Deck.
6. Good and Bad Cards: The deck includes valuable rewards (Gold, Gems, Potions of Healing/Strength/Defense,
   Holy Water), hazards (Pit Trap, Poison Needle), and Wandering Monster ambushes that spawn an active
   monster adjacent to the hero.
7. Interactive Card Presentation: A stylish tabletop card modal displays the drawn treasure card with
   artwork, title, flavor text, and game effects, dismissible via click, spacebar, or enter.
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


def bdd_step(step_type: str, text: str, action_info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]    {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION] {a}")


class TestTreasureSearchE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18105

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🏛️ HEROQUEST TREASURE SEARCH & TREASURE DECK E2E TEST SUITE")
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

    def test_01_search_corridor_rejected(self):
        """Rule: Under standard rules, you cannot perform a treasure search while standing in a hallway or corridor."""
        print("\n=====================================================================================")
        print("🎲 TEST 01: Searching in Corridors is Strictly Prohibited")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian standing in corridor at (0, 1)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1]}]
        )

        bdd_step("WHEN", "Barbarian attempts to search for treasure in corridor")
        res = self.ai.search()

        bdd_step("THEN", "Search is rejected with corridor restriction notice",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Error: {res.get('error')}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertIn("corridor", res.get("error", "").lower())

    def test_02_search_with_monsters_present_rejected(self):
        """Rule: A hero can only search a room for treasure if there are no monsters present in that exact room."""
        print("\n=====================================================================================")
        print("🎲 TEST 02: Searching Rooms Inhabited by Living Monsters is Prohibited")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian inside Northwest Crypt at (4, 3) with an active Skeleton at (3, 4)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3]}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": True, "current_bp": 1, "grid_pos": [3, 4], "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Barbarian attempts to search chamber while skeleton is still standing")
        res = self.ai.search()

        bdd_step("THEN", "Search is blocked due to active monsters in room",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Error: {res.get('error')}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertIn("monsters", res.get("error", "").lower())

    def test_03_search_room_once_per_hero(self):
        """Rule: Each room can only be searched for treasure once per hero."""
        print("\n=====================================================================================")
        print("🎲 TEST 03: Once Per Hero Room Search Limitation")
        print("=====================================================================================")

        bdd_step("GIVEN", "Northwest Crypt is cleared of all monsters and Barbarian is inside at (4, 3)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Barbarian searches the room for the first time")
        res1 = self.ai.search()
        self.assertTrue(res1.get("success"))

        st1 = self.ai.get_state()
        searched_rooms1 = st1.get("searchedRooms", {})
        bdd_step("THEN", "First search succeeds and room is recorded as searched by Barbarian",
                 assertions=[
                     f"First search success: {res1.get('success')}",
                     f"Searched rooms record: {searched_rooms1.get('room-nw-crypt')}"
                 ])
        self.assertIn("barbarian", searched_rooms1.get("room-nw-crypt", []))

        bdd_step("GIVEN", "Barbarian prepares another turn in the same room (preserveSearchedRooms=True)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            preserveSearchedRooms=True
        )

        bdd_step("WHEN", "Barbarian attempts to search the same room a second time")
        res2 = self.ai.search()

        bdd_step("THEN", "Second search is rejected because Barbarian already searched this chamber",
                 assertions=[
                     f"Second search success: {res2.get('success')}",
                     f"Error: {res2.get('error')}"
                 ])
        self.assertFalse(res2.get("success"))
        self.assertIn("already searched", res2.get("error", "").lower())

    def test_04_different_heroes_can_each_search_room(self):
        """Rule: Different heroes can each search the room up to the party search limit."""
        print("\n=====================================================================================")
        print("🎲 TEST 04: Multiple Heroes Can Each Search the Same Cleared Chamber")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian has searched Northwest Crypt; Dwarf now enters at (3, 3)")
        self.ai.set_state(
            activeHero="dwarf",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "grid_pos": [4, 3], "is_on_board": True, "current_bp": 8},
                {"id": "dwarf", "grid_pos": [3, 3], "is_on_board": True, "current_bp": 7, "gold": 0}
            ],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ],
            searchedRooms={"room-nw-crypt": ["barbarian"]},
            roomSpecialTreasureCollected={"room-nw-crypt": True}
        )

        bdd_step("WHEN", "Dwarf searches the chamber")
        res = self.ai.search()

        bdd_step("THEN", "Dwarf's search succeeds because Dwarf has not yet searched this room",
                 assertions=[
                     f"Dwarf search success: {res.get('success')}",
                     f"Gold found: {res.get('goldFound')}"
                 ])
        self.assertTrue(res.get("success"))

        st = self.ai.get_state()
        searched = st.get("searchedRooms", {}).get("room-nw-crypt", [])
        self.assertIn("barbarian", searched)
        self.assertIn("dwarf", searched)

    def test_05_quest_note_awarded_on_first_search(self):
        """Rule: The very first hero to search a room finds the fixed special treasure from Quest Book notes."""
        print("\n=====================================================================================")
        print("🎲 TEST 05: Quest Notes Fixed Treasure Awarded on First Search")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian at (4, 3) in Northwest Crypt which contains a Quest Note stone chest")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Barbarian searches the unsearched chamber")
        res = self.ai.search()

        bdd_step("THEN", "Special Quest Note treasure (50 Gold Coins) is discovered and awarded",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Quest treasure flag: {res.get('questTreasure')}",
                     f"Gold found: {res.get('goldFound')}",
                     f"Card Title: {res.get('card', {}).get('title')}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("questTreasure"))
        self.assertEqual(res.get("goldFound"), 50)

        st = self.ai.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        self.assertEqual(barb.get("gold"), 50)
        self.assertTrue(st.get("roomSpecialTreasureCollected", {}).get("room-nw-crypt"))

    def test_06_treasure_deck_draws_gold_and_potions(self):
        """Rule: When quest notes are collected, subsequent searches draw from the Treasure Deck."""
        print("\n=====================================================================================")
        print("🎲 TEST 06: Treasure Deck Draw - Potion of Healing")
        print("=====================================================================================")

        potion_card = {
            "id": "potion-healing-test",
            "type": "potion",
            "title": "Potion of Healing",
            "item": "healing_potion",
            "gold": 0,
            "icon": "🧪",
            "description": "Restores up to 4 Body Points.",
            "flavor": "Brewed by the court alchemists."
        }

        bdd_step("GIVEN", "Quest treasure collected; Treasure Deck primed with Potion of Healing")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "grid_pos": [3, 8], "inventory": ["broadsword"]}],
            monsters=[
                {"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}
            ],
            roomSpecialTreasureCollected={"room-grand-fossil": True},
            treasureDeck=[potion_card]
        )

        bdd_step("WHEN", "Barbarian searches the room")
        res = self.ai.search()

        bdd_step("THEN", "Potion of Healing is drawn and placed into Barbarian's inventory",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Card drawn: {res.get('card', {}).get('title')}",
                     f"Quest treasure flag: {res.get('questTreasure')}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertFalse(res.get("questTreasure"))
        self.assertEqual(res.get("card", {}).get("id"), "potion-healing-test")

        st = self.ai.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        self.assertIn("healing_potion", barb.get("inventory", []))

    def test_07_treasure_deck_hazard_inflicts_damage(self):
        """Rule: Hazard cards in the Treasure Deck inflict direct damage to the searching hero."""
        print("\n=====================================================================================")
        print("🎲 TEST 07: Treasure Deck Draw - Hazard Card Inflicts Damage")
        print("=====================================================================================")

        hazard_card = {
            "id": "hazard-pit-test",
            "type": "hazard",
            "title": "Hazard! (Pit Trap)",
            "damage": 1,
            "icon": "🕳️",
            "gold": 0,
            "description": "You tumble into a hidden spike pit!",
            "flavor": "Debris clatters around you."
        }

        bdd_step("GIVEN", "Barbarian with 8 BP searches room where next card is a Pit Hazard")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "grid_pos": [3, 8], "current_bp": 8}],
            monsters=[
                {"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}
            ],
            roomSpecialTreasureCollected={"room-grand-fossil": True},
            treasureDeck=[hazard_card]
        )

        bdd_step("WHEN", "Barbarian draws the hazard card")
        res = self.ai.search()

        bdd_step("THEN", "Barbarian suffers 1 damage (8 -> 7 BP)",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Hazard card: {res.get('card', {}).get('title')}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("card", {}).get("type"), "hazard")

        st = self.ai.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        self.assertEqual(barb.get("current_bp"), 7)

    def test_08_wandering_monster_ambush_spawns_monster(self):
        """Rule: Wandering Monster card immediately spawns an active monster adjacent to the hero."""
        print("\n=====================================================================================")
        print("🎲 TEST 08: Wandering Monster Card Spawns Active Ambush Monster")
        print("=====================================================================================")

        wm_card = {
            "id": "wandering-monster-test",
            "type": "wandering_monster",
            "title": "Wandering Monster!",
            "icon": "👹",
            "gold": 0,
            "description": "A wandering monster ambushes you from the shadows!",
            "flavor": "A guttural roar echoes!"
        }

        bdd_step("GIVEN", "Barbarian at (3, 8) in cleared Fossil Hall with Wandering Monster card primed")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "grid_pos": [3, 8]}],
            monsters=[
                {"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}
            ],
            roomSpecialTreasureCollected={"room-grand-fossil": True},
            treasureDeck=[wm_card]
        )

        bdd_step("WHEN", "Barbarian draws Wandering Monster card")
        res = self.ai.search()

        bdd_step("THEN", "A wandering Orc is spawned adjacent to Barbarian",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Wandering monster spawned: {res.get('wanderingMonster', {}).get('name')}",
                     f"Monster position: {res.get('wanderingMonster', {}).get('grid_pos')}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertIsNotNone(res.get("wanderingMonster"))
        wm = res.get("wanderingMonster")
        self.assertTrue(wm.get("is_alive"))
        self.assertIn("wandering", wm.get("name", "").lower())

        # Verify adjacency: Manhattan distance <= 2 (diagonal or orthogonal)
        wm_pos = wm.get("grid_pos")
        if isinstance(wm_pos, str):
            parts = wm_pos.strip("()[]").split(",")
            wm_pos = [int(parts[0].strip()), int(parts[1].strip())]
        dist = abs(wm_pos[0] - 3) + abs(wm_pos[1] - 8)
        self.assertLessEqual(dist, 2)

    def test_09_interactive_treasure_card_overlay_and_click_dismiss(self):
        """Rule: Interactive treasure searches trigger the card modal overlay until dismissed."""
        print("\n=====================================================================================")
        print("🎲 TEST 09: Interactive Treasure Card Modal Overlay & Click Dismissal")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian searches with interactive=True")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        res = self.ai.search(interactive=True)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("waitingForClick"))

        st = self.ai.get_state()
        overlay = st.get("treasureOverlay", {})
        bdd_step("THEN", "active_treasure_overlay is visible with card details",
                 assertions=[
                     f"Overlay active: {overlay.get('active')}",
                     f"Overlay title: {overlay.get('title')}",
                     f"Overlay cardType: {overlay.get('cardType')}",
                     f"Waiting for click: {overlay.get('waitingForClick')}"
                 ])
        self.assertTrue(overlay.get("active"))
        self.assertTrue(overlay.get("waitingForClick"))

        bdd_step("WHEN", "User clicks to collect / dismiss the card overlay")
        dismiss_res = self.ai.resolve_treasure_overlay()
        self.assertTrue(dismiss_res.get("success"))

        st_after = self.ai.get_state()
        self.assertFalse(st_after.get("treasureOverlay", {}).get("active", False))
        bdd_step("THEN", "Overlay is dismissed cleanly")

    def test_10_capture_treasure_card_overlay_screenshot(self):
        """Capture screenshot of the drawn treasure card modal for visual verification."""
        print("\n=====================================================================================")
        print("🎲 TEST 10: Capture Visual Screenshot of Treasure Card Modal")
        print("=====================================================================================")

        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )
        self.ai.search(interactive=True)
        time.sleep(0.3)

        out_path = "/tmp/tabletop_treasure_card_overlay.png"
        res = self.ai.execute_action("take_screenshot", path=out_path)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(out_path))

        bdd_step("THEN", f"Screenshot saved to {out_path} ({os.path.getsize(out_path)} bytes)")
        self.ai.resolve_treasure_overlay()


if __name__ == "__main__":
    unittest.main()
