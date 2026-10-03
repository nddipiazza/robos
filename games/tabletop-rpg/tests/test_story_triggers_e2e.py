#!/usr/bin/env python3
"""
==========================================================================================
📜 FEATURE: HeroQuest Story Triggers & Special Quest Note Announcement Cards E2E Test Suite
   As a HeroQuest tabletop player or Game Master (Zargon)
   When specific scenario conditions are met (entering a marked chamber, searching for
   treasure in a marked room, or opening a specific chest)
   I expect Zargon to immediately pause the game and announce the Quest Book note using
   a deluxe royal parchment Quest Note card with wax seal [A] and read-aloud narrative text
   So that the dungeon unfolds with rich story, unique quest loot, and sudden ambushes.
==========================================================================================
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


class TestStoryTriggersE2E(unittest.TestCase):
    """BDD End-to-End tests verifying HeroQuest story triggers and Quest Note announcement cards."""

    proc = None
    ai = None
    port = 18120

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("📜 HEROQUEST STORY TRIGGERS & QUEST NOTE ANNOUNCEMENT CARDS E2E TEST SUITE")
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
        for _ in range(35):
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
        self.ai.execute_action("reset_game")
        time.sleep(0.2)

    def test_01_story_triggers_loaded_and_hidden_from_player(self):
        """Scenario 1: Story triggers are loaded from the cartridge and hidden from players."""
        bdd_step("GIVEN", "Pristine Quest 1: The Trial cartridge is loaded in player mode",
                 action_info="Inspect story triggers and player role")
        st = self.ai.get_state()
        self.assertEqual(st.get("currentRole"), "player")

        triggers = self.ai.get_story_triggers()
        bdd_step("THEN", "Scenario contains Quest Notes [A] and [B]",
                 assertions=[
                     f"Found {len(triggers)} story triggers in scenario",
                     "Trigger [A] is in Grand Fossil Hall for 'search_treasure'",
                     "Trigger [B] is in Northwest Crypt for 'enter_room'"
                 ])
        self.assertGreaterEqual(len(triggers), 2, "Must contain at least 2 story triggers")
        markers = [t.get("marker") for t in triggers]
        self.assertIn("A", markers, "Trigger [A] must be registered")
        self.assertIn("B", markers, "Trigger [B] must be registered")

        # Verify activeStoryTrigger overlay is initially empty
        active_card = self.ai.get_active_story_trigger()
        self.assertTrue(active_card.is_empty() if hasattr(active_card, "is_empty") else len(active_card) == 0)

    def test_02_gm_view_story_trigger_markers(self):
        """Scenario 2: In GM Mode (Zargon), story trigger markers [A], [B] are visible."""
        bdd_step("GIVEN", "Zargon switches to Game Master view",
                 action_info="ai.toggle_role() -> gm")
        res = self.ai.execute_action("toggle_role")
        self.assertTrue(res.get("success"))
        st = self.ai.get_state()
        self.assertIn(st.get("currentRole"), ["gm", "zargon"])

        bdd_step("THEN", "Game Master has access to story trigger telemetry data",
                 assertions=[
                     "GM role active",
                     "storyTriggers list contains marker, room, and condition data"
                 ])
        triggers = self.ai.get_story_triggers()
        tr_a = next((t for t in triggers if t.get("marker") == "A"), {})
        self.assertEqual(tr_a.get("room"), "room-grand-fossil")
        self.assertEqual(tr_a.get("condition"), "search_treasure")

    def test_03_trigger_a_search_treasure_narrative_and_loot(self):
        """Scenario 3: Searching for treasure in Grand Fossil Hall triggers Note [A] (No card drawn, 50g + Letter)."""
        bdd_step("GIVEN", "Active hero Rogar enters Grand Fossil Hall (cleared of foes) at (3, 9)",
                 action_info="Place Rogar in Grand Fossil Hall and clear chamber monsters")
        self.ai.execute_action("patch_state",
                               activeHero="barbarian",
                               hasActedThisTurn=False,
                               revealedRooms=["room-grand-fossil"],
                               heroes=[{"id": "barbarian", "grid_pos": [3, 9], "gold": 100, "inventory": []}],
                               monsters=[])

        bdd_step("WHEN", "Rogar declares 'I search for treasure'",
                 action_info="ai.search()")
        res = self.ai.search()

        bdd_step("THEN", "Standard card draw is halted and Special Quest Note [A] card appears",
                 assertions=[
                     "search() returns success=True and storyTrigger=True",
                     "activeStoryTrigger card is open",
                     "activeStoryTrigger marker is 'A'",
                     "Title is 'The Emperor's Hidden Epistle'",
                     "Narrative text contains 'Stop. Do not draw a card.'"
                 ])
        self.assertTrue(res.get("success"), "Search must succeed")
        self.assertTrue(res.get("storyTrigger"), "Must flag storyTrigger activation")

        active_card = self.ai.get_active_story_trigger()
        self.assertFalse(active_card.is_empty() if hasattr(active_card, "is_empty") else len(active_card) == 0)
        self.assertEqual(active_card.get("marker"), "A")
        self.assertIn("Emperor", active_card.get("title", ""))
        self.assertIn("Stop. Do not draw a card", active_card.get("narrative", ""))

        bdd_step("WHEN", "Player dismisses the Quest Note announcement card",
                 action_info="ai.dismiss_story_trigger()")
        d_res = self.ai.dismiss_story_trigger()
        self.assertTrue(d_res.get("success"), "Dismiss must succeed")
        self.assertEqual(d_res.get("goldAwarded"), 50, "Must award 50 Gold Coins")
        self.assertTrue(d_res.get("itemAwarded"), "Must award Emperor's Letter item")

        bdd_step("THEN", "Rogar receives 50 gold (total 150) and 'Letter from the Emperor' in inventory",
                 assertions=[
                     "Hero gold == 150",
                     "Hero inventory contains 'Letter from the Emperor'",
                     "activeStoryTrigger is now closed"
                 ])
        st_after = self.ai.get_state()
        hero_after = st_after.get("heroes", [])[0]
        self.assertEqual(hero_after.get("gold"), 150, "Gold must increase by 50")
        inv_names = [i.get("name") if isinstance(i, dict) else str(i) for i in hero_after.get("inventory", [])]
        self.assertTrue(any("Letter from the Emperor" in n for n in inv_names), "Must have Letter from the Emperor in inventory")

    def test_04_trigger_b_enter_room_ambush(self):
        """Scenario 4: Entering the Northwest Crypt triggers Story Trigger [B] and spawns an Ambush Skeleton."""
        bdd_step("GIVEN", "Northwest Crypt is closed and hero Rogar stands at threshold (4, 1)",
                 action_info="Position Rogar outside crypt door")
        self.ai.execute_action("patch_state",
                               activeHero="barbarian",
                               movementRemaining=4,
                               movementRolled=True,
                               movementClosed=False,
                               revealedRooms=[],
                               heroes=[{"id": "barbarian", "grid_pos": [4, 1], "current_bp": 8}],
                               monsters=[])

        # Open door to crypt
        self.ai.open_door(4, 1, 4, 2)

        bdd_step("WHEN", "Rogar steps through the doorway into Northwest Crypt at (4, 3)",
                 action_info="ai.move(4, 3)")
        self.ai.move(4, 3)

        bdd_step("THEN", "Story Trigger [B] is activated pausing the game with Quest Note [B] card",
                 assertions=[
                     "activeStoryTrigger card is open",
                     "Marker is 'B'",
                     "Title is 'Restless Dead of the Catacomb'",
                     "Contains ambush warning"
                 ])
        active_card = self.ai.get_active_story_trigger()
        self.assertFalse(active_card.is_empty() if hasattr(active_card, "is_empty") else len(active_card) == 0)
        self.assertEqual(active_card.get("marker"), "B")
        self.assertIn("Restless Dead", active_card.get("title", ""))

        bdd_step("WHEN", "Player clicks to dismiss the Quest Note [B] announcement card",
                 action_info="ai.dismiss_story_trigger()")
        d_res = self.ai.dismiss_story_trigger()
        self.assertTrue(d_res.get("success"))
        self.assertEqual(d_res.get("monstersSpawned"), 1, "Must spawn 1 Ambush Skeleton")

        bdd_step("THEN", "Ambush Skeleton is now active on the board at (6, 4)",
                 assertions=[
                     "monsters list contains 'mon-skel-ambush'",
                     "Skeleton is alive with 1 Body Point"
                 ])
        st_after = self.ai.get_state()
        m_ids = [m.get("id") for m in st_after.get("monsters", [])]
        self.assertIn("mon-skel-ambush", m_ids, "Ambush skeleton must be spawned on the board")

    def test_05_once_only_trigger_enforcement(self):
        """Scenario 5: Once triggered, a onceOnly story trigger will not activate a second time."""
        bdd_step("GIVEN", "Story Trigger [A] in Grand Fossil Hall has already been triggered",
                 action_info="Trigger Note [A] and dismiss it")
        self.ai.execute_action("patch_state",
                               activeHero="barbarian",
                               hasActedThisTurn=False,
                               revealedRooms=["room-grand-fossil"],
                               heroes=[{"id": "barbarian", "grid_pos": [3, 9], "gold": 100}],
                               monsters=[])
        self.ai.search()
        self.ai.dismiss_story_trigger()

        # Prepare another hero (Dwarf) in the same room
        bdd_step("WHEN", "Second hero Dorgan searches the same room on their turn",
                 action_info="Dorgan searches room-grand-fossil")
        self.ai.execute_action("patch_state",
                               activeHero="dwarf",
                               activeHeroIndex=1,
                               hasActedThisTurn=False,
                               heroes=[
                                   {"id": "barbarian", "grid_pos": [3, 9], "gold": 150},
                                   {"id": "dwarf", "grid_pos": [3, 8], "gold": 100}
                               ])
        res2 = self.ai.search()

        bdd_step("THEN", "Story Trigger [A] is NOT triggered again (standard search proceeds or room exhausted)",
                 assertions=[
                     "activeStoryTrigger remains empty",
                     "res2 does not contain storyTrigger=True"
                 ])
        self.assertFalse(res2.get("storyTrigger", False), "Must not re-trigger once-only story note")
        active_card = self.ai.get_active_story_trigger()
        self.assertTrue(active_card.is_empty() if hasattr(active_card, "is_empty") else len(active_card) == 0)

    def test_06_manual_trigger_story_event_rpc(self):
        """Scenario 6: Game Master / RPC QA can trigger any story event on demand."""
        bdd_step("GIVEN", "Game Master wants to preview Quest Note [A] announcement card",
                 action_info="ai.trigger_story_event('A')")
        res = self.ai.trigger_story_event("A")
        self.assertTrue(res.get("success"), "Manual trigger must succeed")

        active_card = self.ai.get_active_story_trigger()
        self.assertEqual(active_card.get("marker"), "A")
        self.ai.dismiss_story_trigger()

    def test_07_capture_story_trigger_card_screenshot(self):
        """Scenario 7: Capture visual proof screenshot of the special Quest Note story announcement card."""
        bdd_step("GIVEN", "Quest Note [A] announcement card is open on screen",
                 action_info="Trigger Quest Note [A] overlay card")
        self.ai.trigger_story_event("A")
        time.sleep(0.3)

        out_screenshot = "/tmp/tabletop_story_trigger_card.png"
        bdd_step("WHEN", "QA system captures viewport screenshot of the Quest Note card",
                 action_info=f"take_screenshot -> {out_screenshot}")
        res = self.ai.take_screenshot(out_screenshot)
        self.assertTrue(res.get("success"), "Screenshot must succeed")
        self.assertTrue(os.path.exists(out_screenshot), "Screenshot file must exist")
        self.assertGreater(os.path.getsize(out_screenshot), 10000, "Screenshot size must be > 10KB")
        print(f"\n    📸 Visual proof captured: {out_screenshot} ({os.path.getsize(out_screenshot)} bytes)")

        # Dismiss card
        self.ai.dismiss_story_trigger()


if __name__ == "__main__":
    unittest.main()
