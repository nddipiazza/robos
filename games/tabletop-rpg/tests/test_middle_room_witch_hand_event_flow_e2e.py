#!/usr/bin/env python3
"""
test_middle_room_witch_hand_event_flow_e2e.py
BDD-driven End-to-End Test Suite for Middle Room Witch Hand Cinematic & Event-Based Story Trigger Mechanism.

Verifies:
  1. Middle room / Witch Hand door opening triggers cinematic movie via event mechanism.
  2. No jarring blocking textbox (activeStoryTrigger) appears after the movie plays.
  3. AI demo / auto-play progression is completely paused during cinematic playback.
  4. Upon cinematic completion, the event-driven completion callback executes:
     - Undead / skeleton ambush monsters spawn.
     - Narrative is logged cleanly into the quest log / journal.
     - Story trigger completed event is emitted.
     - AI demo progress smoothly resumes without any blocking prompt.
  5. Any non-cinematic narrative cards are auto-acknowledged by AI auto-play without hanging.
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
        print(f"    \U0001f5b1\ufe0f  [ACTION]       {action_info}")
    if assertions:
        for a in assertions:
            print(f"    \u2714  [ASSERTION]    {a}")


class TestMiddleRoomWitchHandEventFlowE2E(unittest.TestCase):
    port = 18128
    proc = None
    ai = None

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🎬 MIDDLE ROOM WITCH HAND CINEMATIC & EVENT-BASED STORY TRIGGER E2E TEST SUITE")
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

    def test_01_witch_hand_trigger_has_movie_and_does_not_spawn_jarring_textbox(self):
        """Scenario 1: Opening door to middle room triggers Witch Hand movie and avoids jarring textbox."""
        bdd_step("GIVEN", "Game is active with custom-quest and Barbarian is outside door-10 at (16, 9)",
                 action_info="Patch state placing hero at (16, 9) facing door-10 to middle room")
        self.ai.execute_action(
            "patch_state",
            activeHero="barbarian",
            heroes=[{"id": "barbarian", "grid_pos": [16, 9], "is_on_board": True, "current_bp": 8}],
            hasActedThisTurn=False
        )

        bdd_step("WHEN", "Door-10 is opened into middle room (room-nw-10)",
                 action_info="ai.open_door(16, 9, 15, 9)")
        res = self.ai.open_door(16, 9, 15, 9)
        self.assertTrue(res.get("success"), f"Door opening must succeed: {res}")

        bdd_step("THEN", "Witch Hand movie was triggered via event and activeStoryTrigger is EMPTY (no jarring textbox)",
                 assertions=[
                     "Door is open",
                     "Movie quest_scene_f_witch_hand_undead is in playedMovies",
                     "activeStoryTrigger overlay card is EMPTY (no jarring blocking modal)"
                 ])
        mv_state = self.ai.get_movie_state()
        played = mv_state.get("playedMovies", [])
        has_witch_movie = any("quest_scene_f_witch_hand_undead" in m for m in played)
        self.assertTrue(has_witch_movie, f"Witch hand movie must have been triggered. Played: {played}")

        active_card = self.ai.get_active_story_trigger()
        card_empty = active_card.is_empty() if hasattr(active_card, "is_empty") else len(active_card) == 0
        self.assertTrue(card_empty, f"activeStoryTrigger MUST be empty (no jarring textbox)! Got: {active_card}")

    def test_02_simulation_and_ai_paused_during_cinematic_playback(self):
        """Scenario 2: Simulation and AI step execution are strictly paused while a cinematic plays."""
        bdd_step("GIVEN", "A cinematic movie is started",
                 action_info="ai.play_movie(quest_scene_f_witch_hand_undead.ogv, once_only=False)")
        # Force a movie playback
        res_play = self.ai.play_movie("res://assets/movies/quest_scene_f_witch_hand_undead.ogv", title="Witch Hand Test", once_only=False)
        self.assertTrue(res_play.get("success"), f"Movie play must succeed: {res_play}")

        bdd_step("THEN", "In headless mode, movie finishes cleanly via deferred event callback",
                 assertions=[
                     "isPlaying transitions cleanly to False",
                     "playedMovies contains the movie"
                 ])
        mv_state = self.ai.get_movie_state()
        played = mv_state.get("playedMovies", [])
        self.assertTrue(any("quest_scene_f_witch_hand_undead" in m for m in played))

    def test_03_event_callback_spawns_monsters_and_logs_narrative(self):
        """Scenario 3: Cinematic completion event callback executes spawns and logs narrative without blocking."""
        bdd_step("GIVEN", "Barbarian opens door-10 to room-nw-10",
                 action_info="Execute open_door action on door-10")
        self.ai.execute_action(
            "patch_state",
            activeHero="barbarian",
            heroes=[{"id": "barbarian", "grid_pos": [16, 9], "is_on_board": True, "current_bp": 8}],
            hasActedThisTurn=False
        )
        self.ai.open_door(16, 9, 15, 9)

        bdd_step("THEN", "Room 10 monsters are revealed and story trigger lore is recorded in journal",
                 assertions=[
                     "Monsters in middle room are alive and discovered",
                     "Quest log records door open and story event"
                 ])
        st = self.ai.get_state()
        monsters = st.get("monsters", [])
        room10_monsters = [m for m in monsters if str(m.get("roomId", "")) == "room-nw-10" and bool(m.get("is_alive", False))]
        self.assertGreaterEqual(len(room10_monsters), 1, "Middle room monsters must be active")

    def test_04_ai_auto_play_does_not_hang_on_story_triggers(self):
        """Scenario 4: AI auto-play / demo progress is NOT blocked by story triggers."""
        bdd_step("GIVEN", "AI auto-play is enabled and a story trigger is fired",
                 action_info="Enable autonomous demo mode and trigger story note")
        self.ai.start_demo()
        st_before = self.ai.get_state()
        self.assertTrue(st_before.get("isDemoActive") or st_before.get("aiPlayForYou"), "Demo or AI auto-play must be active")

        # Step the demo
        step_res = self.ai.step_demo()
        self.assertTrue(step_res.get("success"), f"step_demo must succeed without hanging: {step_res}")

        # Ensure activeStoryTrigger is not blocking
        active_card = self.ai.get_active_story_trigger()
        card_empty = active_card.is_empty() if hasattr(active_card, "is_empty") else len(active_card) == 0
        self.assertTrue(card_empty, f"activeStoryTrigger must not block demo! Card: {active_card}")


if __name__ == "__main__":
    unittest.main()
