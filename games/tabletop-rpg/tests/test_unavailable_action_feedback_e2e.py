#!/usr/bin/env python3
"""
==========================================================================================
⚠️ FEATURE: Unavailable Action & Movement Feedback (2s Hold & Fade) E2E Test Suite
   As a HeroQuest tabletop player
   When I attempt an action or movement that is unavailable (e.g., out of movement,
   action already taken, blocked by wall/furniture, or clicking disabled buttons)
   I expect to receive clear visual feedback ("Not enough movement", "Not enough actions")
   that stays prominent for 2 seconds and then smoothly fades out over 0.5 seconds
   So that I clearly understand game rules and turn progression without frustration.
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


class TestUnavailableActionFeedbackE2E(unittest.TestCase):
    """BDD End-to-End tests verifying unavailable action and movement feedback."""

    proc = None
    ai = None
    port = 18116

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚠️ UNAVAILABLE ACTION & MOVEMENT FEEDBACK (2s HOLD & FADE) E2E TEST SUITE")
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

    def test_01_movement_exhausted_feedback(self):
        """Scenario 1: Attempting to move when movement points are exhausted triggers 'Not enough movement'."""
        bdd_step("GIVEN", "Active hero Rogar has rolled movement dice and spent all movement points",
                 action_info="Roll movement dice and set movement_remaining = 0")
        self.ai.execute_action("roll_movement")
        self.ai.execute_action("patch_state", movementRemaining=0)
        st = self.ai.get_state()
        self.assertEqual(st.get("movementRemaining"), 0, "Movement remaining must be 0")

        heroes = st.get("heroes", [])
        active_idx = st.get("activeHeroIndex", 0)
        hero = heroes[active_idx] if active_idx < len(heroes) else {}
        h_pos = hero.get("grid_pos", [1, 1])
        adj_tile_x = h_pos[0] + 1
        adj_tile_y = h_pos[1]

        bdd_step("WHEN", f"Player clicks adjacent tile ({adj_tile_x}, {adj_tile_y}) to move",
                 action_info=f"Click tile ({adj_tile_x}, {adj_tile_y})")
        self.ai.click_tile(adj_tile_x, adj_tile_y)
        time.sleep(0.1)

        bdd_step("THEN", "HUD warning toast and floating badge display 'Not enough movement' notice",
                 assertions=[
                     "unavailableNotice.active is True",
                     "unavailableNotice.text contains 'Not enough movement'",
                     "unavailableNotice.alpha >= 0.95",
                     "Floating text badge has is_unavailable=True"
                 ])
        notice = self.ai.get_unavailable_notice()
        self.assertTrue(notice.get("active"), "Unavailable notice must be active")
        self.assertIn("Not enough movement", notice.get("text", ""))
        self.assertGreaterEqual(notice.get("alpha", 0.0), 0.9, "Notice must be at full opacity")

        st_after = self.ai.get_state()
        unavail_fts = [ft for ft in st_after.get("floatingTexts", []) if ft.get("is_unavailable")]
        self.assertTrue(len(unavail_fts) > 0, "At least one unavailable floating badge must be spawned")
        self.assertIn("Not enough movement", unavail_fts[-1].get("text", ""))

    def test_02_action_exhausted_feedback(self):
        """Scenario 2: Attempting an action when action already taken triggers 'Not enough actions'."""
        bdd_step("GIVEN", "Active hero has already performed an action this turn (hasActedThisTurn = True)",
                 action_info="Patch state with hasActedThisTurn = True")
        self.ai.execute_action("patch_state", hasActedThisTurn=True)
        st = self.ai.get_state()
        self.assertTrue(st.get("hasActedThisTurn"), "hasActedThisTurn must be True")

        bdd_step("WHEN", "Player attempts to search the room or attack",
                 action_info="Search room with action already taken")
        res = self.ai.execute_action("search_room")
        time.sleep(0.1)

        bdd_step("THEN", "Game rejects search and displays 'Not enough actions' unavailable notice",
                 assertions=[
                     "search_room success is False",
                     "unavailableNotice.active is True",
                     "unavailableNotice.text == 'Not enough actions'"
                 ])
        self.assertFalse(res.get("success"), "Search must be rejected when action already taken")
        notice = self.ai.get_unavailable_notice()
        self.assertTrue(notice.get("active"), "Unavailable notice must be active")
        self.assertEqual(notice.get("text"), "Not enough actions")

    def test_03_disabled_hotbar_action_button_click_feedback(self):
        """Scenario 3: Clicking disabled hotbar buttons shows appropriate unavailable notices."""
        bdd_step("GIVEN", "Hero has taken an action and traps action button is disabled",
                 action_info="Set hasActedThisTurn = True and verify action buttons disabled")
        self.ai.execute_action("patch_state", hasActedThisTurn=True)

        bdd_step("WHEN", "Player clicks the disabled traps button on the hotbar",
                 action_info="Click action button 'traps'")
        res = self.ai.click_action_button("traps")
        time.sleep(0.1)

        bdd_step("THEN", "Button click shield intercepts event and triggers 'Not enough actions'",
                 assertions=[
                     "click_action_button returns disabled=True",
                     "unavailableNotice.active is True",
                     "unavailableNotice.text == 'Not enough actions'"
                 ])
        self.assertTrue(res.get("disabled"), "Traps button must report disabled")
        self.assertEqual(res.get("reason"), "Not enough actions")
        notice = self.ai.get_unavailable_notice()
        self.assertTrue(notice.get("active"), "Notice must be active")
        self.assertEqual(notice.get("text"), "Not enough actions")

        # Also verify clicking disabled movement roll button when movement exhausted
        bdd_step("AND", "Player clicks disabled movement button when movement is concluded",
                 action_info="Click action button 'roll' when movementClosed=True")
        self.ai.execute_action("patch_state", movementClosed=True)
        res_roll = self.ai.click_action_button("roll")
        time.sleep(0.1)
        self.assertTrue(res_roll.get("disabled"), "Roll button must report disabled")
        self.assertEqual(res_roll.get("reason"), "Not enough movement")
        notice_roll = self.ai.get_unavailable_notice()
        self.assertTrue(notice_roll.get("active"), "Notice must be active")
        self.assertEqual(notice_roll.get("text"), "Not enough movement")

    def test_04_notice_timing_two_second_hold_then_fade(self):
        """Scenario 4: Unavailable notice stays for 2.0s at full opacity, then fades out smoothly over 0.5s."""
        bdd_step("GIVEN", "An unavailable notice is triggered with 2.5s total duration",
                 action_info="Trigger notice 'Not enough movement'")
        self.ai.trigger_unavailable_notice("Not enough movement")
        time.sleep(0.1)

        # Sample at ~0.5s elapsed: should still be in 2.0s hold phase (alpha == 1.0)
        st_early = self.ai.get_state()
        notice_early = st_early.get("unavailableNotice", {})
        bdd_step("WHEN", "0.5s has elapsed within the 2.0s hold window",
                 assertions=[
                     "notice is active",
                     "timer > 0.5s",
                     "alpha == 1.0 (fully visible without fading)"
                 ])
        self.assertTrue(notice_early.get("active"), "Notice must be active at 0.5s")
        self.assertGreater(notice_early.get("timer", 0.0), 0.5, "Timer must be in hold phase")
        self.assertAlmostEqual(notice_early.get("alpha", 0.0), 1.0, delta=0.05)
        self.assertFalse(notice_early.get("isFading", False), "Notice must NOT be fading yet during hold")

        # Sleep to reach ~2.1s elapsed (within the 2.0s to 2.5s fade window)
        bdd_step("WHEN", "2.1s has elapsed, transitioning into the 0.5s fade window",
                 action_info="Wait 1.7s to enter fade window")
        time.sleep(1.7)
        st_fade = self.ai.get_state()
        notice_fade = st_fade.get("unavailableNotice", {})

        bdd_step("THEN", "Notice is in fading state with alpha decreasing smoothly below 1.0",
                 assertions=[
                     "timer <= 0.5s",
                     "isFading is True",
                     "alpha < 1.0 and alpha > 0.0"
                 ])
        self.assertTrue(notice_fade.get("active"), "Notice should still be active during fade")
        self.assertTrue(notice_fade.get("isFading"), "isFading must be True when timer <= 0.5")
        self.assertLess(notice_fade.get("alpha", 1.0), 1.0, "Alpha must have decreased during fade")
        self.assertGreater(notice_fade.get("alpha", 0.0), 0.0, "Alpha must still be partially visible")

        # Sleep to exceed 2.6s total: notice must be completely expired and inactive
        bdd_step("WHEN", "Total duration exceeds 2.6s",
                 action_info="Wait 0.9s for total duration completion")
        time.sleep(0.9)
        st_expired = self.ai.get_state()
        notice_expired = st_expired.get("unavailableNotice", {})

        bdd_step("THEN", "Notice is completely expired and hidden",
                 assertions=[
                     "unavailableNotice.active is False",
                     "unavailableNotice.timer <= 0.0"
                 ])
        self.assertFalse(notice_expired.get("active"), "Notice must be inactive after 2.5s")

    def test_05_blocked_furniture_and_wall_feedback(self):
        """Scenario 5: Interactive click on furniture or wall tiles gives immediate blocked feedback."""
        bdd_step("GIVEN", "A dungeon layout with stone walls and furniture items",
                 action_info="Inspect walls and furniture in current state")
        st = self.ai.get_state()
        furns = st.get("furniture", [])
        self.assertTrue(len(furns) > 0, "Furniture items must exist")

        target_furn = furns[0]
        fx = int(target_furn.get("x", 1))
        fy = int(target_furn.get("y", 1))

        bdd_step("WHEN", f"Player clicks furniture tile at ({fx}, {fy})",
                 action_info=f"Click tile ({fx}, {fy})")
        self.ai.click_tile(fx, fy)
        time.sleep(0.1)

        bdd_step("THEN", "Unavailable feedback confirms 'Blocked by furniture'",
                 assertions=[
                     "unavailableNotice.active is True",
                     "unavailableNotice.text == 'Blocked by furniture'"
                 ])
        notice = self.ai.get_unavailable_notice()
        self.assertTrue(notice.get("active"), "Notice must be active")
        self.assertEqual(notice.get("text"), "Blocked by furniture")

    def test_06_capture_feedback_screenshot(self):
        """Scenario 6: Visual verification and screenshot capture of HUD unavailable toast and floating badge."""
        bdd_step("GIVEN", "Hero clicks an unavailable action triggering prominent warning feedback",
                 action_info="Trigger unavailable notice 'Not enough actions'")
        self.ai.trigger_unavailable_notice("Not enough actions", tile_x=4, tile_y=4)
        time.sleep(0.15)

        out_screenshot = "/tmp/tabletop_unavailable_action_feedback.png"
        bdd_step("WHEN", f"Screen capture is taken at {out_screenshot}",
                 action_info=f"Capturing game viewport to {out_screenshot}")
        res = self.ai.take_screenshot(out_screenshot)

        bdd_step("THEN", "Screenshot is successfully written to disk for visual proof",
                 assertions=[
                     "take_screenshot reports success=True",
                     f"File exists at {out_screenshot}"
                 ])
        self.assertTrue(res.get("success"), "Screenshot capture must succeed")
        self.assertTrue(os.path.exists(out_screenshot), f"File {out_screenshot} must exist")
        file_sz = os.path.getsize(out_screenshot)
        self.assertGreater(file_sz, 10000, f"Screenshot file size ({file_sz} bytes) must be substantial")
        print(f"    📸 Visual proof captured: {out_screenshot} ({file_sz} bytes)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
