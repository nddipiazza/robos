#!/usr/bin/env python3
"""
test_map_end_turn_button_e2e.py
BDD End-to-End Test Suite verifying the additional convenience 'End Turn' button
positioned on the map's top-right corner.

Requirements:
- Additional 'End Turn' button rendered at the top-right corner of the tabletop map area.
- Synchronized with active hero turn, phase, and GM mode.
- Clicking the map top-right button cleanly concludes the active turn and passes initiative.
- Hotbar button and map top-right button share matching states.
- Fully exposed in telemetry (scene_ui and root mapEndTurnButton).
- Accessible via RPC actions ('click_map_end_turn', 'click_action_button("map_end_turn")').
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

from rpc_ai.tabletop_rpc_ai import TabletopRPCAI


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"⌛ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestMapEndTurnButtonE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18130

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⌛ FEATURE: Map Top-Right Corner Convenience 'End Turn' Button")
        print("   Rule: Quick-access button on tabletop map to advance turns effortlessly")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--skip-spell-select"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopRPCAI(port=cls.port, human_delay=0.05)
        connected = False
        for _ in range(35):
            if cls.ai.check_health():
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
            try:
                cls.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def setUp(self):
        self.ai.reset_game()

    def test_01_map_end_turn_button_telemetry_and_visibility(self):
        bdd_scenario_header(1, "Map Top-Right End Turn Button Telemetry & Initial Visibility")
        bdd_step("GIVEN", "Game loads active quest with player heroes in hero_phase")
        st = self.ai.get_state()

        bdd_step("WHEN", "Inspecting telemetry for mapEndTurnButton and scene.ui.buttons.map_end_turn")
        map_btn = st.get("mapEndTurnButton", {})
        ui_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("map_end_turn", {})

        self.assertTrue(map_btn.get("visible"), "Top-right map end turn button must be visible")
        self.assertFalse(map_btn.get("disabled"), "Top-right map end turn button must be enabled")
        self.assertIn("Skip Turn", map_btn.get("text", ""), "Initial text is Skip Turn before moving")

        # After rolling movement, text updates to 'End Turn'
        self.ai.roll_movement()
        st_rolled = self.ai.get_state()
        self.assertIn("End Turn", st_rolled.get("mapEndTurnButton", {}).get("text", ""))

        self.assertTrue(ui_btn.get("visible"), "UI buttons map_end_turn must report visible")
        bdd_step("THEN", "Map button telemetry is verified", assertions=[
            f"visible: {map_btn.get('visible')}",
            f"disabled: {map_btn.get('disabled')}",
            f"text: {map_btn.get('text')} -> {st_rolled.get('mapEndTurnButton', {}).get('text')}"
        ])

    def test_02_click_map_end_turn_advances_hero(self):
        bdd_scenario_header(2, "Clicking Map Top-Right Button Advances Active Hero Turn")
        bdd_step("GIVEN", "Active hero is Barbarian (index 0)")
        st0 = self.ai.get_state()
        self.assertEqual(st0.get("activeHeroIndex"), 0)
        self.assertEqual(st0.get("activeHero"), "barbarian")

        bdd_step("WHEN", "Player clicks the map top-right convenience 'End Turn' button")
        res = self.ai.click_map_end_turn()
        self.assertTrue(res.get("success"), f"click_map_end_turn failed: {res}")

        bdd_step("THEN", "Turn advances to next hero (Dwarf, index 1)")
        st1 = self.ai.get_state()
        self.assertEqual(st1.get("activeHeroIndex"), 1)
        self.assertEqual(st1.get("activeHero"), "dwarf")
        self.assertEqual(st1.get("turnState"), "awaiting_roll")
        self.assertFalse(st1.get("hasActedThisTurn"))
        self.assertFalse(st1.get("hasMovedThisTurn"))
        bdd_step("THEN", "Initiative passed to Dwarf", assertions=[
            "Active Hero Index: 0 -> 1",
            "Active Hero: barbarian -> dwarf",
            "turnState: awaiting_roll"
        ])

    def test_03_click_action_button_map_end_turn(self):
        bdd_scenario_header(3, "Clicking Map End Turn via 'click_action_button' RPC")
        bdd_step("GIVEN", "Active hero is Dwarf (index 1)")
        # Advance to Dwarf first
        self.ai.click_map_end_turn()
        st0 = self.ai.get_state()
        self.assertEqual(st0.get("activeHeroIndex"), 1)

        bdd_step("WHEN", "Action 'click_action_button' is invoked with button='map_end_turn'")
        res = self.ai.click_action_button("map_end_turn")
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Turn advances to Elf (index 2)")
        st1 = self.ai.get_state()
        self.assertEqual(st1.get("activeHeroIndex"), 2)
        self.assertEqual(st1.get("activeHero"), "elf")
        bdd_step("THEN", "Initiative passed to Elf", assertions=[
            "Active Hero Index: 1 -> 2",
            "Active Hero: elf"
        ])

    def test_04_full_hero_round_cycling_via_map_button(self):
        bdd_scenario_header(4, "Full Hero Party Turn Cycling via Map Top-Right Button")
        bdd_step("GIVEN", "Hero party starts turn cycle at Barbarian (0)")
        self.assertEqual(self.ai.get_state().get("activeHeroIndex"), 0)

        # 0 -> 1 (Dwarf)
        self.ai.click_map_end_turn()
        self.assertEqual(self.ai.get_state().get("activeHeroIndex"), 1)

        # 1 -> 2 (Elf)
        self.ai.click_map_end_turn()
        self.assertEqual(self.ai.get_state().get("activeHeroIndex"), 2)

        # 2 -> 3 (Wizard)
        self.ai.click_map_end_turn()
        self.assertEqual(self.ai.get_state().get("activeHeroIndex"), 3)

        bdd_step("WHEN", "Wizard concludes turn via top-right map end turn button")
        self.ai.click_map_end_turn()

        bdd_step("THEN", "Hero phase completes and GM phase begins")
        st_gm = self.ai.get_state()
        self.assertEqual(st_gm.get("phase"), "gm_phase")
        bdd_step("THEN", "Phase successfully transitioned to gm_phase", assertions=[
            "All 4 heroes completed turns",
            "phase: gm_phase"
        ])

    def test_05_game_master_mode_synchronization(self):
        bdd_scenario_header(5, "Game Master Mode Button Text & State Synchronization")
        bdd_step("GIVEN", "Player toggles role to Game Master (Zargon) during GM phase")
        self.ai.toggle_role()
        self.ai.set_state(current_phase="gm_phase")
        st_gm = self.ai.get_state()
        self.assertEqual(st_gm.get("currentRole"), "gm")

        bdd_step("THEN", "Map button text synchronizes to '⏭️ End GM Turn'")
        map_btn = st_gm.get("mapEndTurnButton", {})
        self.assertTrue(map_btn.get("visible"))
        self.assertIn("End GM Turn", map_btn.get("text"))

        bdd_step("WHEN", "Zargon clicks the map top-right button to conclude GM turn")
        self.ai.click_map_end_turn()

        bdd_step("THEN", "Round advances and initiative returns to heroes")
        st_next = self.ai.get_state()
        self.assertEqual(st_next.get("phase"), "hero_phase")
        self.assertEqual(st_next.get("round"), 2)
        self.assertEqual(st_next.get("activeHeroIndex"), 0)
        bdd_step("THEN", "New round begun successfully", assertions=[
            "round: 2",
            "phase: hero_phase",
            "activeHero: barbarian"
        ])

    def test_06_map_end_turn_hover_feedback(self):
        bdd_scenario_header(6, "Hover Action Telemetry for Map Top-Right Button")
        bdd_step("WHEN", "Hovering mouse over 'map_end_turn' button")
        hov_res = self.ai.execute_action("hover_action_button", button="map_end_turn")
        self.assertTrue(hov_res.get("success"), f"Hover failed: {hov_res}")

        bdd_step("WHEN", "Unhovering mouse from button")
        unhov_res = self.ai.execute_action("unhover_action_button", button="map_end_turn")
        self.assertTrue(unhov_res.get("success"))
        bdd_step("THEN", "Hover & unhover handled cleanly")

    def test_07_visual_proof_screenshot(self):
        bdd_scenario_header(7, "Visual Proof: Capture Tabletop Map Top-Right End Turn Button")
        bdd_step("GIVEN", "Game board active with visible top-right 'End Turn' button")
        time.sleep(0.2)

        bdd_step("WHEN", "Capturing viewport screenshot to /tmp/tabletop_map_end_turn_button.png")
        out_shot = "/tmp/tabletop_map_end_turn_button.png"
        res = self.ai.take_screenshot(out_shot)
        self.assertTrue(res.get("success"), f"Screenshot capture failed: {res}")
        self.assertTrue(os.path.exists(out_shot), f"File {out_shot} does not exist")
        bdd_step("THEN", f"Screenshot verified at {out_shot}", assertions=[
            f"File size: {os.path.getsize(out_shot)} bytes"
        ])


if __name__ == "__main__":
    unittest.main(verbosity=2)
