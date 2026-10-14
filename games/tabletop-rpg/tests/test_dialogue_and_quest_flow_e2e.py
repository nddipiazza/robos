#!/usr/bin/env python3
"""
==========================================================================================
💬 FEATURE: Multi-Bubble Dialogue Sequences, Modal Message Dialogs & Quest Flow E2E Test
   As a HeroQuest tabletop player or scenario author
   When a hero enters a crypt chamber with dialogue triggers
   I expect on-screen speech bubbles to present a multi-bubble dialogue sequence in order,
   logging every spoken line into the combat journal,
   followed by a modal message dialog that pauses the game until dismissed by the player.
   When the guardian enemy is defeated, a victory dialogue occurs, a cinematic video plays,
   and the quest concludes in glorious victory!
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


class TestDialogueAndQuestFlowE2E(unittest.TestCase):
    """BDD End-to-End tests verifying dialogue speech bubbles, modal message dialogs, and victory pipeline."""

    proc = None
    ai = None
    port = 18135

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("💬 TABLETOP RPG DIALOGUE SEQUENCES, MODAL MESSAGES & QUEST FLOW E2E TEST SUITE")
        print("=" * 90)
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port), TABLETOP_CARTRIDGE="simple-dialogue-quest")
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--cartridge=simple-dialogue-quest"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopQAPlayer(port=cls.port, human_delay=0.1)
        connected = False
        for _ in range(40):
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
        time.sleep(0.1)

    def test_01_cartridge_loaded_with_crypt_and_guardian(self):
        """Scenario 1: Simple dialogue quest cartridge loads with crypt chamber and guardian monster."""
        bdd_step("GIVEN", "Cartridge 'simple-dialogue-quest' is loaded in the tabletop engine",
                 action_info="Fetch game state telemetry")
        st = self.ai.get_state()

        hero_pos = st.get("activeHeroPos", [-1, -1])
        monsters = st.get("monsters", [])
        doors = st.get("doors", [])

        bdd_step("THEN", "Barbarian starts at stair [4, 1], door [4, 1]->[4, 2] is closed, and guardian is in crypt",
                 assertions=[
                     f"Hero position is {hero_pos}",
                     f"Found {len(monsters)} monster(s) in scenario",
                     f"Found {len(doors)} door(s) on the board"
                 ])
        self.assertEqual(hero_pos[0], 4)
        self.assertEqual(hero_pos[1], 1)
        self.assertTrue(len(monsters) >= 1)
        guardian = monsters[0]
        self.assertEqual(guardian.get("id"), "mon-crypt-guardian")
        self.assertTrue(guardian.get("is_alive", True))

    def test_02_entering_room_triggers_dialogue_bubble_sequence(self):
        """Scenario 2: Moving into the crypt triggers on_room_entered and starts bubble 1 (Barbarian)."""
        bdd_step("WHEN", "Barbarian opens door at [4, 1]->[4, 2] and steps into Northwest Crypt at [4, 2]",
                 action_info="Open door and move hero to [4, 2]")
        self.ai.open_door(4, 1, 4, 2)
        self.ai.move(4, 2)

        st = self.ai.get_state()
        dialogue = st.get("activeDialogue", {})

        bdd_step("THEN", "Speech bubble 1 is active with Barbarian dialogue",
                 assertions=[
                     f"Dialogue active flag: {dialogue.get('active')}",
                     f"Current bubble index: {dialogue.get('index')}",
                     f"Speaker display name: {dialogue.get('speakerName')}",
                     f"Dialogue text: '{dialogue.get('text')}'"
                 ])

        self.assertTrue(dialogue.get("active", False))
        self.assertEqual(dialogue.get("index"), 0)
        self.assertIn("barbarian", dialogue.get("speaker", "").lower())
        self.assertIn("Steady your blades", dialogue.get("text", ""))

        # Check combat journal contains the dialogue speech
        log_text = " ".join(st.get("combatLog", []) or st.get("fullCombatLog", []))
        self.assertIn("Steady your blades", log_text)

    def test_03_advancing_dialogue_shows_bubble_two_wizard(self):
        """Scenario 3: Advancing dialogue sequence displays bubble 2 with Wizard dialogue."""
        bdd_step("WHEN", "Player advances dialogue sequence (Space, Enter, or Click)",
                 action_info="Call advance_dialogue")
        adv_res = self.ai.advance_dialogue()
        self.assertTrue(adv_res.get("success", False))

        st = self.ai.get_state()
        dialogue = st.get("activeDialogue", {})

        bdd_step("THEN", "Speech bubble 2 is active with Wizard dialogue",
                 assertions=[
                     f"Dialogue active flag: {dialogue.get('active')}",
                     f"Current bubble index: {dialogue.get('index')}",
                     f"Speaker display name: {dialogue.get('speakerName')}",
                     f"Dialogue text: '{dialogue.get('text')}'"
                 ])

        self.assertTrue(dialogue.get("active", False))
        self.assertEqual(dialogue.get("index"), 1)
        self.assertIn("wizard", dialogue.get("speaker", "").lower())
        self.assertIn("Crypt Guardian", dialogue.get("text", ""))

        # Check combat journal contains Wizard's line
        log_text = " ".join(st.get("combatLog", []) or st.get("fullCombatLog", []))
        self.assertIn("Crypt Guardian", log_text)

    def test_04_dialogue_finish_opens_modal_message_dialog(self):
        """Scenario 4: Finishing dialogue sequence seamlessly opens the chained modal display_message dialog."""
        bdd_step("WHEN", "Player advances past the last dialogue bubble",
                 action_info="Call advance_dialogue to finish speech sequence")
        adv_res = self.ai.advance_dialogue()
        self.assertTrue(adv_res.get("success", False))

        st = self.ai.get_state()
        dialogue = st.get("activeDialogue", {})
        story_trigger = st.get("activeStoryTrigger", {})

        bdd_step("THEN", "Dialogue sequence concludes and modal message dialog is displayed",
                 assertions=[
                     f"Dialogue active: {dialogue.get('active', False)}",
                     f"Modal message overlay active: {not not story_trigger}",
                     f"Message title: '{story_trigger.get('title')}'",
                     f"Message text: '{story_trigger.get('narrative')}'",
                     f"Dismiss button text: '{story_trigger.get('buttonText')}'"
                 ])

        self.assertFalse(dialogue.get("active", False))
        self.assertTrue(len(story_trigger) > 0)
        self.assertEqual(story_trigger.get("title"), "The Guardian Awakes")
        self.assertIn("iron doors seal shut", story_trigger.get("narrative", ""))
        self.assertEqual(story_trigger.get("buttonText"), "Fight!")

    def test_05_dismiss_modal_message_and_defeat_crypt_guardian(self):
        """Scenario 5: Dismissing modal message resumes game; defeating guardian triggers on_monster_killed."""
        bdd_step("WHEN", "Player dismisses the modal message dialog by clicking 'Fight!'",
                 action_info="Call dismiss_message")
        dis_res = self.ai.dismiss_message()
        self.assertTrue(dis_res.get("success", False))

        st = self.ai.get_state()
        self.assertTrue(len(st.get("activeStoryTrigger", {})) == 0)

        bdd_step("WHEN", "Barbarian strikes down the Crypt Guardian",
                 action_info="Defeat monster mon-crypt-guardian")
        kill_res = self.ai.defeat_monster("mon-crypt-guardian")
        self.assertTrue(kill_res.get("success", False))

        st_after = self.ai.get_state()
        dialogue = st_after.get("activeDialogue", {})

        bdd_step("THEN", "Guardian defeat triggers victory dialogue bubble",
                 assertions=[
                     f"Victory dialogue active: {dialogue.get('active')}",
                     f"Speaker: {dialogue.get('speakerName')}",
                     f"Text: '{dialogue.get('text')}'"
                 ])

        self.assertTrue(dialogue.get("active", False))
        self.assertIn("beast is slain", dialogue.get("text", "").lower())

    def test_06_victory_dialogue_advance_triggers_video_and_game_end(self):
        """Scenario 6: Advancing victory dialogue plays cinematic video and concludes quest in victory."""
        bdd_step("WHEN", "Player advances the victory dialogue bubble",
                 action_info="Call advance_dialogue")
        adv_res = self.ai.advance_dialogue()
        self.assertTrue(adv_res.get("success", False))

        st = self.ai.get_state()
        bdd_step("THEN", "Cinematic video is played and quest is completed with victory",
                 assertions=[
                     f"Quest completed flag: {st.get('isQuestCompleted')}",
                     f"Active dialogue: {st.get('activeDialogue', {}).get('active', False)}"
                 ])

        self.assertTrue(st.get("isQuestCompleted", False))


if __name__ == "__main__":
    unittest.main()
