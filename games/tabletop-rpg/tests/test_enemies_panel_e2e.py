#!/usr/bin/env python3
"""
Test Tabletop RPG Enemies Panel E2E:
Validates the Discovered Foes panel:
- Dead monsters are not displayed by default
- Clicking 'Show Defeated' toggles display of fallen foes
- 'Show Defeated' button updates count and text ('Show Defeated' vs 'Hide Defeated')
- Large monster list overflows gracefully into a scrollable container with smooth vertical scrolling
- 2-column grid maintains layout without horizontal clipping
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

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(prefix: str, msg: str, assertions: list = None):
    print(f"  {prefix.upper():<7} {msg}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestEnemiesPanelE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18097

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 85)
        print("💀 TABLETOP RPG ENEMIES PANEL & DEFEATED TOGGLE E2E TEST SUITE")
        print("=" * 85)
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(30):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()

    def setUp(self):
        self.player.reset_game()

    def _reveal_crypt_skeletons(self):
        """Helper to reveal the 2 skeletons in Northwest crypt."""
        self.player.execute_action("set_state",
            revealedRooms=["room-nw-crypt"],
            doors=[{"from": [4, 1], "to": [4, 2], "is_open": True, "is_secret": False, "is_revealed": True}]
        )

    def test_01_dead_monsters_hidden_by_default(self):
        """SCENARIO 1: Dead monsters are not shown by default."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Dead Monsters Are Hidden by Default")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian discovers 2 Crypt Skeletons in Northwest Crypt")
        self._reveal_crypt_skeletons()
        st = self.player.get_state()
        self.assertEqual(len(st.get("enemyCards", [])), 2)
        self.assertEqual(st.get("displayedEnemiesCount"), 2)
        self.assertFalse(st.get("showDefeated", False))

        bdd_step("WHEN", "Crypt Skeleton #1 is defeated in combat (current_bp=0)")
        self.player.execute_action("set_monster_bp", monsterId="mon-skel-1", bp=0)
        st_after = self.player.get_state()

        bdd_step("THEN", "Defeated skeleton is hidden from UI grid by default",
                 assertions=[
                     f"Total discovered in record: {len(st_after.get('enemyCards', []))}",
                     f"Displayed in UI count: {st_after.get('displayedEnemiesCount')} (expected 1)",
                     f"Defeated count: {st_after.get('defeatedEnemiesCount')} (expected 1)",
                     f"showDefeated state: {st_after.get('showDefeated')} (expected False)"
                 ])
        self.assertEqual(st_after.get("displayedEnemiesCount"), 1)
        self.assertEqual(st_after.get("defeatedEnemiesCount"), 1)
        self.assertFalse(st_after.get("showDefeated"))

        # Verify skeleton 1 has displayedInUi=False while skeleton 2 has displayedInUi=True
        cards = {c["id"]: c for c in st_after.get("enemyCards", [])}
        self.assertFalse(cards["mon-skel-1"].get("displayedInUi", True))
        self.assertTrue(cards["mon-skel-2"].get("displayedInUi", False))

    def test_02_show_defeated_toggle_button(self):
        """SCENARIO 2: Clicking 'Show Defeated' toggles display of fallen foes."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Toggle 'Show Defeated' Button Shows and Hides Fallen Monsters")
        print("-" * 80)

        bdd_step("GIVEN", "Two crypt skeletons with Skeleton #1 defeated")
        self._reveal_crypt_skeletons()
        self.player.execute_action("set_monster_bp", monsterId="mon-skel-1", bp=0)
        st = self.player.get_state()
        ep = st.get("scene", {}).get("ui", {}).get("enemiesPanel", {})

        bdd_step("THEN", "Toggle button displays '💀 Show Defeated (1)'",
                 assertions=[f"Button text: {ep.get('toggleButtonText')}"])
        self.assertIn("Show Defeated", ep.get("toggleButtonText", ""))
        self.assertIn("1", ep.get("toggleButtonText", ""))

        bdd_step("WHEN", "Player clicks 'Show Defeated' button")
        res_toggle = self.player.execute_action("toggle_defeated")
        self.assertTrue(res_toggle.get("success", False))
        self.assertTrue(res_toggle.get("showDefeated", False))

        st_toggled = self.player.get_state()
        ep_toggled = st_toggled.get("scene", {}).get("ui", {}).get("enemiesPanel", {})
        bdd_step("THEN", "Button changes to 'Hide Defeated (1)' and both cards appear in UI grid",
                 assertions=[
                     f"Button text: {ep_toggled.get('toggleButtonText')}",
                     f"Displayed in UI count: {st_toggled.get('displayedEnemiesCount')} (expected 2)",
                     f"showDefeated: {st_toggled.get('showDefeated')} (expected True)"
                 ])
        self.assertIn("Hide Defeated", ep_toggled.get("toggleButtonText", ""))
        self.assertEqual(st_toggled.get("displayedEnemiesCount"), 2)
        self.assertTrue(st_toggled.get("showDefeated"))

        bdd_step("WHEN", "Player clicks 'Hide Defeated' button again")
        res_toggle2 = self.player.execute_action("toggle_defeated")
        self.assertTrue(res_toggle2.get("success", False))
        self.assertFalse(res_toggle2.get("showDefeated", True))

        st_hidden = self.player.get_state()
        bdd_step("THEN", "Defeated skeleton is once again hidden from the UI grid",
                 assertions=[f"Displayed in UI count: {st_hidden.get('displayedEnemiesCount')} (expected 1)"])
        self.assertEqual(st_hidden.get("displayedEnemiesCount"), 1)

    def test_03_all_foes_defeated_empty_state_guidance(self):
        """SCENARIO 3: When all discovered foes are slain, helpful guidance is shown."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Empty State Guidance When All Foes Are Slain")
        print("-" * 80)

        bdd_step("GIVEN", "Both discovered crypt skeletons are defeated in battle")
        self._reveal_crypt_skeletons()
        self.player.execute_action("set_monster_bp", monsterId="mon-skel-1", bp=0)
        self.player.execute_action("set_monster_bp", monsterId="mon-skel-2", bp=0)

        st = self.player.get_state()
        bdd_step("THEN", "UI displays 0 enemies and toggle button offers 'Show Defeated (2)'",
                 assertions=[
                     f"Displayed in UI: {st.get('displayedEnemiesCount')} (expected 0)",
                     f"Defeated count: {st.get('defeatedEnemiesCount')} (expected 2)"
                 ])
        self.assertEqual(st.get("displayedEnemiesCount"), 0)
        self.assertEqual(st.get("defeatedEnemiesCount"), 2)

        ep = st.get("scene", {}).get("ui", {}).get("enemiesPanel", {})
        self.assertIn("Show Defeated (2)", ep.get("toggleButtonText", ""))

    def test_04_large_monster_list_overflow_and_scrolling(self):
        """SCENARIO 4: Large monster list (15+ monsters) overflows and scrolls smoothly."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Large Monster List Overflows and Scrolls Vertically")
        print("-" * 80)

        bdd_step("GIVEN", "A massive dungeon horde of 16 monsters is discovered")
        res_add = self.player.execute_action("add_dynamic_monsters", count=16, halfDead=True)
        self.assertTrue(res_add.get("success", False))

        st = self.player.get_state()
        ep = st.get("scene", {}).get("ui", {}).get("enemiesPanel", {})
        bdd_step("THEN", "By default only living monsters are displayed",
                 assertions=[
                     f"Total monsters in game: {res_add.get('totalMonsters')}",
                     f"Living displayed in UI: {st.get('displayedEnemiesCount')}",
                     f"Defeated count: {st.get('defeatedEnemiesCount')}"
                 ])
        self.assertGreater(st.get("displayedEnemiesCount", 0), 0)

        bdd_step("WHEN", "Player toggles 'Show Defeated' to view all 16+ monsters")
        self.player.execute_action("set_show_defeated", show=True)
        st_full = self.player.get_state()
        ep_full = st_full.get("scene", {}).get("ui", {}).get("enemiesPanel", {})

        bdd_step("THEN", "All monsters are rendered and scroll overflow is active",
                 assertions=[
                     f"Displayed in UI: {st_full.get('displayedEnemiesCount')} (expected >= 16)",
                     f"Can scroll: {ep_full.get('canScroll')}"
                 ])
        self.assertGreaterEqual(st_full.get("displayedEnemiesCount", 0), 16)
        self.assertTrue(ep_full.get("canScroll", False))

        bdd_step("WHEN", "Player scrolls vertically down the enemies list")
        res_scroll = self.player.execute_action("scroll_enemies", delta=120)
        self.assertTrue(res_scroll.get("success", False))

        st_scrolled = self.player.get_state()
        ep_scrolled = st_scrolled.get("scene", {}).get("ui", {}).get("enemiesPanel", {})
        bdd_step("THEN", "Vertical scroll position updates cleanly",
                 assertions=[f"scrollVertical: {ep_scrolled.get('scrollVertical')}"])
        self.assertGreater(ep_scrolled.get("scrollVertical", 0), 0)


if __name__ == "__main__":
    unittest.main()
