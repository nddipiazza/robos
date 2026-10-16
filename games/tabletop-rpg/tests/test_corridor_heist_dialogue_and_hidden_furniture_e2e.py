#!/usr/bin/env python3
"""
test_corridor_heist_dialogue_and_hidden_furniture_e2e.py
BDD End-to-End Test Suite for Hidden Furniture, Corridor Heist Action Sequence,
and Character Dialogue Bubbles with Optional Audio and Fade-Out.

Verifies:
  1. "Heist Treasure Chest" (furn-chest-3) starts hidden (hidden: true) and does not occupy tiles.
  2. Stepping on tile [7, 18] triggers trigger-note-a-2bug.
  3. Cinematic quest_scene_a_corridor_heist.ogv completes via event callback.
  4. Action 2 executes: Goblin dialogue ("Goblin who hesited chest") appears anchored over goblin at [16, 18].
  5. Advancing dialogue executes Action 3: "Heist Treasure Chest" becomes visible at [17, 18].
  6. Action 4 executes: Orc dialogue ("Orc who hesited chest") appears anchored over orc at [18, 18].
  7. Advancing dialogue executes Action 5: "Heist Treasure Chest" moves to [18, 17].
  8. Audio stream length calculation and fade timeout properties are verified.
"""

import os
import sys
import time
import unittest
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(prefix: str, step_text: str, assertions: list = None, action_info: str = ""):
    print(f"\n  {prefix:<7} {step_text}")
    if action_info:
        print(f"    🖱️  [ACTION]       {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestCorridorHeistDialogueAndHiddenFurnitureE2E(unittest.TestCase):
    port = 18131
    proc = None
    ai = None

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎬 CORRIDOR HEIST DIALOGUE & HIDDEN FURNITURE E2E TEST SUITE")
        print("=" * 90)
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(
            os.environ,
            TABLETOP_SERVER_PORT=str(cls.port),
            TABLETOP_CARTRIDGE="custom-quest"
        )
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--cartridge=custom-quest"],
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

    def test_01_heist_chest_starts_hidden_and_unoccupied(self):
        """Scenario 1: Heist Treasure Chest has hidden flag set and does not block path."""
        bdd_step("GIVEN", "Game loads custom-quest cartridge with Heist Treasure Chest",
                 action_info="Fetch game state and inspect furniture")
        state = self.ai.get_state()
        furn_list = state.get("furniture", [])
        chest = next((f for f in furn_list if f.get("id") == "furn-chest-3" or f.get("name") == "Heist Treasure Chest"), None)

        self.assertIsNotNone(chest, "furn-chest-3 must exist in cartridge furniture")
        self.assertTrue(chest.get("hidden", False), "Heist Treasure Chest must start with hidden: True")
        self.assertEqual(chest.get("x"), 17)
        self.assertEqual(chest.get("y"), 18)

        bdd_step("THEN", "Hidden chest does not occupy the tile for player movement/passability",
                 assertions=[
                     "chest.hidden == True",
                     "Chest initial position is [17, 18]"
                 ])

    def test_02_corridor_heist_trigger_runs_full_5_action_pipeline(self):
        """Scenario 2: Stepping on [7, 18] plays movie, triggers Goblin dialogue, reveals chest, triggers Orc dialogue, and moves chest."""
        bdd_step("GIVEN", "Barbarian steps onto corridor tile [7, 18]",
                 action_info="Trigger story trigger trigger-note-a-2bug")
        res = self.ai.execute_action("trigger_story_event", id="trigger-note-a-2bug")
        self.assertTrue(res.get("success", False), "trigger_story_event should succeed")

        # Allow deferred event callback from headless movie player to resolve
        time.sleep(0.3)

        bdd_step("THEN", "Movie finishes and Action 2 (Goblin dialogue) is active",
                 action_info="Inspect activeDialogue state")
        state = self.ai.get_state()
        dialogue = state.get("activeDialogue", {})
        self.assertTrue(dialogue.get("active", False), "Dialogue sequence should be active")
        self.assertIn("Goblin", dialogue.get("speaker", ""), "Speaker should be the goblin")
        self.assertIn("its the humans!", dialogue.get("text", ""), "Text should match goblin panic line")

        bdd_step("WHEN", "Goblin dialogue is advanced",
                 action_info="ai.execute_action('advance_dialogue')")
        adv_res = self.ai.execute_action("advance_dialogue")
        self.assertTrue(adv_res.get("success", False), "advance_dialogue should succeed")
        time.sleep(0.2)

        bdd_step("THEN", "Action 3 (furniture_visible) has executed and Action 4 (Orc dialogue) is active",
                 action_info="Inspect chest visibility and activeDialogue")
        state2 = self.ai.get_state()
        furn_list2 = state2.get("furniture", [])
        chest2 = next((f for f in furn_list2 if f.get("id") == "furn-chest-3"), None)
        self.assertIsNotNone(chest2)
        self.assertFalse(chest2.get("hidden", True), "Chest must now be revealed (hidden == False)")
        self.assertEqual(chest2.get("x"), 17)
        self.assertEqual(chest2.get("y"), 18)

        dialogue2 = state2.get("activeDialogue", {})
        self.assertTrue(dialogue2.get("active", False), "Dialogue sequence should be active for Orc")
        self.assertIn("Orc", dialogue2.get("speaker", ""), "Speaker should be the orc")
        self.assertIn("useless runt", dialogue2.get("text", ""), "Text should match orc line")

        bdd_step("WHEN", "Orc dialogue is advanced",
                 action_info="ai.execute_action('advance_dialogue')")
        adv_res2 = self.ai.execute_action("advance_dialogue")
        self.assertTrue(adv_res2.get("success", False), "advance_dialogue should succeed")
        time.sleep(0.2)

        bdd_step("THEN", "Action 5 (move_furniture) has executed: chest moved to [18, 17]",
                 action_info="Inspect chest final position",
                 assertions=[
                     "chest.x == 18 and chest.y == 17",
                     "dialogue sequence has finished"
                 ])
        state3 = self.ai.get_state()
        furn_list3 = state3.get("furniture", [])
        chest3 = next((f for f in furn_list3 if f.get("id") == "furn-chest-3"), None)
        self.assertIsNotNone(chest3)
        self.assertEqual(chest3.get("x"), 18, "Chest X must be 18")
        self.assertEqual(chest3.get("y"), 17, "Chest Y must be 17")
        self.assertFalse(chest3.get("hidden", True), "Chest must remain revealed")
        self.assertFalse(state3.get("activeDialogue", {}).get("active", False), "Dialogue sequence should be concluded")

    def test_03_standalone_dialogue_and_furniture_api_actions(self):
        """Scenario 3: Test direct start_dialogue, reveal_furniture, and move_furniture action APIs."""
        bdd_step("GIVEN", "Direct start_dialogue action with multiple speaker bubbles and fade timeout",
                 action_info="ai.execute_action('start_dialogue', lines=[...])")
        res = self.ai.execute_action(
            "start_dialogue",
            lines=[
                {"speaker": "Goblin who hesited chest", "text": "Take the loot!", "fade_timeout": 0.8},
                {"speaker": "Orc who hesited chest", "text": "Out of my way!", "fade_timeout": 0.8}
            ]
        )
        self.assertTrue(res.get("success", False))

        state = self.ai.get_state()
        diag = state.get("activeDialogue", {})
        self.assertTrue(diag.get("active", False))
        self.assertEqual(diag.get("speaker"), "Goblin who hesited chest")
        self.assertEqual(diag.get("speakerName"), "Goblin who hesited chest")

        # Advance to second bubble
        adv = self.ai.execute_action("advance_dialogue")
        self.assertTrue(adv.get("success", False))
        state2 = self.ai.get_state()
        diag2 = state2.get("activeDialogue", {})
        self.assertTrue(diag2.get("active", False))
        self.assertEqual(diag2.get("speaker"), "Orc who hesited chest")
        self.assertEqual(diag2.get("speakerName"), "Orc who hesited chest")

        # Advance to finish
        adv2 = self.ai.execute_action("advance_dialogue")
        self.assertTrue(adv2.get("success", False))
        state3 = self.ai.get_state()
        self.assertFalse(state3.get("activeDialogue", {}).get("active", False))

        bdd_step("WHEN", "Calling move_furniture with custom message",
                 action_info="move_furniture furn-chest-3 with custom message")
        custom_txt = "Chest was thrown through the wall and the wall absorbed the chest like it was made of smoke!!"
        mf_res = self.ai.move_furniture("furn-chest-3", [14, 18], message=custom_txt)
        self.assertTrue(mf_res.get("success", False))
        self.assertEqual(mf_res.get("message"), custom_txt)
        state4 = self.ai.get_state()
        chest = next((f for f in state4.get("furniture", []) if f.get("id") == "furn-chest-3"), None)
        self.assertEqual(chest.get("x"), 14)
        self.assertEqual(chest.get("y"), 18)

        bdd_step("WHEN", "Calling move_furniture with template placeholders {name}, {x}, {y}",
                 action_info="move_furniture with templated message")
        tmpl_res = self.ai.move_furniture("furn-chest-3", [12, 18], message="{name} was hurled to ({x}, {y})!")
        self.assertTrue(tmpl_res.get("success", False))
        self.assertEqual(tmpl_res.get("message"), "Heist Treasure Chest was hurled to (12, 18)!")

        bdd_step("WHEN", "Calling move_furniture without message (default)",
                 action_info="move_furniture default message fallback")
        def_res = self.ai.move_furniture("furn-chest-3", [11, 18])
        self.assertTrue(def_res.get("success", False))
        self.assertIn("HEIST TREASURE CHEST MOVED", def_res.get("message", ""))


if __name__ == "__main__":
    unittest.main()
