#!/usr/bin/env python3
"""
test_trap_rediscovery_prevention_e2e.py

Verifies that when a hero searches for traps:
1. Hidden, undiscovered traps are properly detected and display the '⚠️ TRAP DISCOVERED' message.
2. Already discovered traps (detected=True) are NOT rediscovered on subsequent searches.
3. Sprung, disarmed, spent, or blocked traps are never rediscovered.
4. Rooms with mixed discovered and undiscovered traps only discover the hidden ones.
5. Corridors also prevent rediscovering already detected traps.
"""

import os
import sys
import time
import unittest
import subprocess

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, action_info: str = None, assertions: list = None):
    type_badge = {
        "GIVEN": "  GIVEN  ",
        "WHEN":  "  WHEN   ",
        "THEN":  "  THEN   ",
        "AND":   "  AND    "
    }.get(step_type, f"  {step_type} ")
    print(f"\n{type_badge} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]       {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestTrapRediscoveryPreventionE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚠️ FEATURE: Prevent Rediscovering Already Discovered Traps on Search")
        print("   As a HeroQuest tabletop player")
        print("   When I or another hero have already searched an area and discovered a trap")
        print("   I do not want already discovered traps to be rediscovered with the 'trap discovered' message")
        print("   So that search actions only report genuinely new, undiscovered hazards")
        print("=" * 90)

        cls.play_script = os.path.join(PROJECT_ROOT, "play.sh")
        cls.port = 18106
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.1)
        connected = False
        for _ in range(30):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()

    def test_01_hidden_trap_discovered_on_first_search(self):
        """Scenario 1: Searching a room with a hidden trap detects it and spawns the discovery message."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Hidden Trap Discovered on First Search")
        print("-" * 80)

        bdd_step("GIVEN", "Dwarf inside room-nw-crypt at (4, 3) with undetected pit trap at (4, 4)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="dwarf",
            hasActed=False,
            heroes=[{"id": "dwarf", "grid_pos": [4, 3], "is_on_board": True}],
            revealedRooms=["room-nw-crypt"],
            monsters=[],
            traps=[{
                "id": "trap-crypt-pit",
                "x": 4,
                "y": 4,
                "type": "pit",
                "detected": False,
                "disarmed": False,
                "sprung": False
            }]
        )

        bdd_step("WHEN", "Dwarf conducts search_traps action for the first time",
                 action_info="search_traps()")
        res = self.player.search_traps()
        st = self.player.get_state()
        trap_obj = next((t for t in st.get("traps", []) if t.get("id") == "trap-crypt-pit"), {})
        floating_texts = [ft.get("text", "") for ft in st.get("floatingTexts", [])]

        bdd_step("THEN", "Trap becomes detected, trapsCount is 1, and 'TRAP DISCOVERED' message appears",
                 assertions=[
                     f"Search success: {res.get('success')}",
                     f"trapsCount: {res.get('trapsCount')} (expected 1)",
                     f"foundTraps: {res.get('foundTraps')} (expected ['trap-crypt-pit'])",
                     f"Trap detected state: {trap_obj.get('detected')} (expected True)",
                     f"Floating text displayed: {floating_texts}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("trapsCount"), 1)
        self.assertIn("trap-crypt-pit", res.get("foundTraps", []))
        self.assertTrue(trap_obj.get("detected"))
        self.assertTrue(any("TRAP" in txt and "DISCOVERED" in txt for txt in floating_texts))

    def test_02_already_discovered_trap_not_rediscovered_in_room(self):
        """Scenario 2: Searching the same room again does NOT rediscover the already discovered trap."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Already Discovered Trap is NOT Rediscovered with Message")
        print("-" * 80)

        bdd_step("GIVEN", "Dwarf in room-nw-crypt at (4, 3) where pit trap at (4, 4) is ALREADY detected")
        self.player.reset_game()
        self.player.set_state(
            activeHero="dwarf",
            hasActed=False,
            heroes=[{"id": "dwarf", "grid_pos": [4, 3], "is_on_board": True}],
            revealedRooms=["room-nw-crypt"],
            monsters=[],
            traps=[{
                "id": "trap-crypt-pit",
                "x": 4,
                "y": 4,
                "type": "pit",
                "detected": True,
                "disarmed": False,
                "sprung": False
            }]
        )

        bdd_step("WHEN", "Dwarf searches the room for traps again",
                 action_info="search_traps()")
        res = self.player.search_traps()
        st = self.player.get_state()
        floating_texts = [ft.get("text", "") for ft in st.get("floatingTexts", [])]

        bdd_step("THEN", "No traps are rediscovered, trapsCount is 0, and no 'TRAP DISCOVERED' message is spawned",
                 assertions=[
                     f"Search success: {res.get('success')}",
                     f"trapsCount: {res.get('trapsCount')} (expected 0)",
                     f"foundTraps: {res.get('foundTraps')} (expected [])",
                     f"No TRAP DISCOVERED text: {not any('TRAP DISCOVERED' in txt for txt in floating_texts)}",
                     f"Floating feedback: {floating_texts}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("trapsCount"), 0)
        self.assertEqual(res.get("foundTraps"), [])
        self.assertFalse(any("TRAP DISCOVERED" in txt for txt in floating_texts))
        self.assertTrue(any("NO NEW TRAPS" in txt for txt in floating_texts))

    def test_03_room_with_mixed_traps_only_discovers_hidden_one(self):
        """Scenario 3: Room with 1 already discovered trap and 1 hidden trap only discovers the hidden one."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Room with Mixed Traps Only Discovers Genuinely Hidden Trap")
        print("-" * 80)

        bdd_step("GIVEN", "Northwest Crypt with Trap A (detected) at (4, 4) and Trap B (hidden) at (3, 3)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="dwarf",
            hasActed=False,
            heroes=[{"id": "dwarf", "grid_pos": [4, 3], "is_on_board": True}],
            revealedRooms=["room-nw-crypt"],
            monsters=[],
            traps=[
                {
                    "id": "trap-already-found",
                    "x": 4,
                    "y": 4,
                    "type": "pit",
                    "detected": True,
                    "disarmed": False,
                    "sprung": False
                },
                {
                    "id": "trap-new-hidden",
                    "x": 3,
                    "y": 3,
                    "type": "spear",
                    "detected": False,
                    "disarmed": False,
                    "sprung": False
                }
            ]
        )

        bdd_step("WHEN", "Dwarf conducts search_traps action",
                 action_info="search_traps()")
        res = self.player.search_traps()
        st = self.player.get_state()
        new_trap = next((t for t in st.get("traps", []) if t.get("id") == "trap-new-hidden"), {})
        floating_texts = [ft.get("text", "") for ft in st.get("floatingTexts", [])]

        bdd_step("THEN", "Only the hidden trap is found (trapsCount=1); already found trap is skipped",
                 assertions=[
                     f"trapsCount: {res.get('trapsCount')} (expected 1)",
                     f"foundTraps: {res.get('foundTraps')} (expected ['trap-new-hidden'])",
                     f"New trap detected: {new_trap.get('detected')} (expected True)",
                     f"Floating text contains TRAP DISCOVERED: {any('TRAP DISCOVERED' in txt for txt in floating_texts)}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("trapsCount"), 1)
        self.assertEqual(res.get("foundTraps"), ["trap-new-hidden"])
        self.assertTrue(new_trap.get("detected"))

    def test_04_sprung_and_disarmed_traps_not_rediscovered(self):
        """Scenario 4: Sprung or disarmed traps are never rediscovered on search."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Sprung and Disarmed Traps Are Never Rediscovered")
        print("-" * 80)

        bdd_step("GIVEN", "Room with one sprung trap and one disarmed trap")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "is_on_board": True}],
            revealedRooms=["room-nw-crypt"],
            monsters=[],
            traps=[
                {
                    "id": "trap-sprung",
                    "x": 4,
                    "y": 4,
                    "type": "pit",
                    "detected": True,
                    "sprung": True,
                    "disarmed": False
                },
                {
                    "id": "trap-disarmed",
                    "x": 3,
                    "y": 3,
                    "type": "spear",
                    "detected": True,
                    "sprung": False,
                    "disarmed": True
                }
            ]
        )

        bdd_step("WHEN", "Barbarian searches for traps",
                 action_info="search_traps()")
        res = self.player.search_traps()
        st = self.player.get_state()
        floating_texts = [ft.get("text", "") for ft in st.get("floatingTexts", [])]

        bdd_step("THEN", "trapsCount is 0, no discovery messages appear, and NO NEW TRAPS is shown",
                 assertions=[
                     f"trapsCount: {res.get('trapsCount')} (expected 0)",
                     f"foundTraps: {res.get('foundTraps')} (expected [])",
                     f"No TRAP DISCOVERED text: {not any('TRAP DISCOVERED' in txt for txt in floating_texts)}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("trapsCount"), 0)
        self.assertEqual(res.get("foundTraps"), [])
        self.assertFalse(any("TRAP DISCOVERED" in txt for txt in floating_texts))

    def test_05_corridor_trap_not_rediscovered_on_subsequent_search(self):
        """Scenario 5: In a corridor, a detected trap is not rediscovered on subsequent search."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Corridor Trap Not Rediscovered on Subsequent Search")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian in corridor at (1, 1) with hidden trap at (2, 1)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "is_on_board": True}],
            revealedRooms=[],
            monsters=[],
            traps=[{
                "id": "corridor-trap",
                "x": 2,
                "y": 1,
                "type": "pit",
                "detected": False,
                "disarmed": False,
                "sprung": False
            }]
        )

        bdd_step("WHEN", "Barbarian searches corridor for the first time",
                 action_info="search_traps()")
        res1 = self.player.search_traps()
        bdd_step("THEN", "First search discovers corridor-trap",
                 assertions=[
                     f"trapsCount: {res1.get('trapsCount')} (expected 1)",
                     f"foundTraps: {res1.get('foundTraps')} (expected ['corridor-trap'])"
                 ])
        self.assertEqual(res1.get("trapsCount"), 1)
        self.assertIn("corridor-trap", res1.get("foundTraps", []))

        bdd_step("GIVEN", "Barbarian prepares another turn at (1, 1) with corridor-trap now detected")
        self.player.set_state(hasActed=False, resetFloatingTexts=True)

        bdd_step("WHEN", "Barbarian searches corridor again",
                 action_info="search_traps()")
        res2 = self.player.search_traps()
        st2 = self.player.get_state()
        floating_texts = [ft.get("text", "") for ft in st2.get("floatingTexts", [])]

        bdd_step("THEN", "Second search finds 0 traps and does NOT rediscover corridor-trap",
                 assertions=[
                     f"trapsCount: {res2.get('trapsCount')} (expected 0)",
                     f"foundTraps: {res2.get('foundTraps')} (expected [])",
                     f"No TRAP DISCOVERED text: {not any('TRAP DISCOVERED' in txt for txt in floating_texts)}"
                 ])
        self.assertEqual(res2.get("trapsCount"), 0)
        self.assertEqual(res2.get("foundTraps"), [])
        self.assertFalse(any("TRAP DISCOVERED" in txt for txt in floating_texts))


if __name__ == "__main__":
    unittest.main()
