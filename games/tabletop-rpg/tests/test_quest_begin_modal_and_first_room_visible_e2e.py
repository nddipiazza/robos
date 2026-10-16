#!/usr/bin/env python3
"""
BDD E2E Test Suite: Quest Begin Objective Dialog, Hotbar Toolbar Button, & Starting Room Visibility

Feature:
  As an adventurer embarking on a quest:
  1. I want the quest objectives dialog to appear front and center at quest begin
  2. I want the quest objectives accessible from the action toolbar without a floating HUD obscuring the board
  3. I want the first chamber where my party begins to be revealed and visible so we can explore and proceed
"""

import os
import signal
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer


class TestQuestBeginModalAndFirstRoomVisibleE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18199
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")

    def setUp(self):
        self.proc = None
        self.player = None

    def _stop_game(self):
        if self.proc:
            try:
                pgid = os.getpgid(self.proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            try:
                self.proc.wait(timeout=2.0)
            except Exception:
                pass
            self.proc = None
        if self.player:
            self.player = None

    def tearDown(self):
        self._stop_game()

    def _start_game(self, extra_args=None, extra_env=None):
        env = dict(
            os.environ,
            TABLETOP_SERVER_PORT=str(self.port),
            TABLETOP_FORCE_QUEST_OBJECTIVE_MODAL="1",
            TABLETOP_RESET="1"
        )
        if extra_env:
            env.update(extra_env)

        cmd = [
            "xvfb-run", "--auto-servernum",
            self.play_script,
            "5",  # simple-dialogue-quest
            "--role=player",
            "--headless"
        ]
        if extra_args:
            cmd.extend(extra_args)

        self.proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )
        self.player = TabletopQAPlayer(port=self.port, human_delay=0.05)
        self.assertTrue(self.player.wait_for_ready(timeout=14.0), "Godot Tabletop server failed to start")

    def test_quest_begin_center_dialog_toolbar_and_first_room_visibility(self):
        print("\n==========================================================================================")
        print("📜 BDD SCENARIO: Quest objectives center dialog, toolbar button, & starting chamber visibility")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()

        print("  GIVEN   Quest 5 (The Crypt Guardian) has loaded at quest begin")
        self.assertEqual(st.get("gameState"), "quest_begin", f"Expected quest_begin state, got {st.get('gameState')}")

        print("  THEN    1) Quest Objectives dialog appears center screen at quest begin")
        self.assertTrue(st.get("questObjectiveModalOpen"), "Quest Objective modal should be open at quest begin")
        self.assertTrue(
            st.get("scene", {}).get("ui", {}).get("modal", {}).get("questObjectiveModalVisible"),
            "questObjectiveModalVisible should be true in UI modal state"
        )
        obj_data = st.get("questObjective", {})
        self.assertIn("Crypt Guardian", obj_data.get("title", ""), "Quest title should mention Crypt Guardian")
        print(f"    ✔  [VERIFIED] Modal is open with Title: {obj_data.get('title')}")

        print("  AND     2) Floating HUD is hidden and Quest Objectives is moved to the toolbar")
        hud_info = st.get("questObjectivesHUD", {})
        self.assertFalse(hud_info.get("hudPanelVisible"), "Floating HUD panel on dungeon board should be hidden")
        self.assertTrue(hud_info.get("hasToolbarButton"), "Toolbar should have Quest Objectives button")

        scene_ui = st.get("scene", {}).get("ui", {})
        btn_obj = scene_ui.get("buttons", {}).get("quest_objectives", {})
        self.assertTrue(btn_obj.get("visible"), "BtnQuestObjectives on toolbar must be visible")
        print(f"    ✔  [VERIFIED] Toolbar action button is active: '{btn_obj.get('text')}' tooltip: '{btn_obj.get('tooltip')}'")

        print("  AND     3) Starting chamber 'room-nw-1' is revealed and visible")
        revealed_rooms = st.get("revealedRooms", [])
        self.assertIn("room-nw-1", revealed_rooms, f"Starting chamber 'room-nw-1' must be in revealedRooms! Got: {revealed_rooms}")

        # Check explored tiles includes starting chamber tiles
        explored = [tuple(p) for p in st.get("exploredTiles", [])]
        self.assertIn((4, 1), explored, "Stairs tile (4, 1) must be explored")
        self.assertIn((4, 2), explored, "Tile (4, 2) inside starting room must be explored")
        self.assertIn((4, 3), explored, "Tile (4, 3) inside starting room must be explored")
        print(f"    ✔  [VERIFIED] Starting chamber revealed: {revealed_rooms} with {len(explored)} tiles explored")

        # Check monster inside starting room is present and visible
        monsters = st.get("monsters", [])
        guardian_found = any(m.get("id") == "mon-crypt-guardian" for m in monsters)
        self.assertTrue(guardian_found, "Crypt Guardian in starting chamber must be present in monsters")
        guardian_token = st.get("scene", {}).get("tokens", {}).get("mon-crypt-guardian", {})
        self.assertTrue(guardian_token.get("visible"), "Crypt Guardian token must be visible on the board")
        print(f"    ✔  [VERIFIED] Crypt Guardian discovered and visible in starting room")

        print("  WHEN    Player closes the Quest Objective dialog to proceed")
        res_close = self.player.close_quest_objective()
        self.assertTrue(res_close.get("success", False), "close_quest_objective action should succeed")

        st_after_close = self.player.get_state()
        self.assertFalse(st_after_close.get("questObjectiveModalOpen"), "Modal must be closed after close action")
        print("    ✔  [VERIFIED] Modal dismissed cleanly")

        print("  WHEN    Player toggles Quest Objectives from the toolbar")
        self.player.toggle_quest_objective()
        st_toggle = self.player.get_state()
        self.assertTrue(st_toggle.get("questObjectiveModalOpen"), "Modal must reopen via toolbar toggle")
        self.player.close_quest_objective()
        print("    ✔  [VERIFIED] Toolbar toggle opens and closes modal seamlessly")

        print("  WHEN    Active hero rolls movement and steps inside starting chamber")
        roll_res = self.player.roll_movement()
        self.assertTrue(roll_res.get("success", False), "Movement roll should succeed")
        move_rem = roll_res.get("movementRemaining", 0)
        self.assertGreater(move_rem, 0, "Movement remaining must be > 0")

        # Step to (4, 2)
        step_res = self.player.move(4, 2)
        self.assertTrue(step_res.get("success", False), f"Hero should move to (4, 2) in starting chamber! Error: {step_res}")

        final_st = self.player.get_state()
        active_h_id = final_st.get("activeHero")
        active_h = next(h for h in final_st.get("heroes", []) if h.get("id") == active_h_id)
        self.assertEqual(active_h.get("grid_pos"), [4, 2], f"Hero should be at [4, 2], got {active_h.get('grid_pos')}")
        print(f"    ✔  [VERIFIED] Hero successfully moved inside starting room to {active_h.get('grid_pos')}")
        print("==========================================================================================")
        print("🎉 ALL SCENARIOS PASSED SUCCESSFULLY!")
        print("==========================================================================================")


if __name__ == "__main__":
    unittest.main()
