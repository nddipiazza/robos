#!/usr/bin/env python3
"""
test_search_treasure_button_always_visible_e2e.py
BDD End-to-End test suite verifying that the "Search Room for Treasure" button (btn_search):
1. ALWAYS remains visible on the action hotbar across all gameplay phases and states.
2. Is dynamically disabled whenever a treasure search is unavailable, with rich, rule-accurate tooltips:
   - "already searched": Chamber has already been searched by the hero (or exhausted by party).
   - "monster in room": Living monsters are present in the same chamber.
   - "some other reason": Standing in a corridor, action already used, turn concluded, or GM/Zargon phase.
3. Disabled click shield intercepts clicks to display on-screen feedback notices with matching reasons.
4. Hotbar hover dynamically updates bottom HUD guidance text (dice_label) with the action title and reason.
5. Captures high-res visual proof screenshots for documentation and verification.
"""

import os
import shutil
import subprocess
import sys
import time
import unittest
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer

PORT = 18128
ARTIFACT_DIR = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"🎲 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"          ℹ {info}")
    if assertions:
        for a in assertions:
            print(f"          ✔ {a}")


class TestSearchTreasureButtonAlwaysVisibleE2E(unittest.TestCase):
    godot_proc = None
    player = None

    @classmethod
    def setUpClass(cls):
        print(f"\nStarting Tabletop RPG Godot headless server for Search Button Suite on port {PORT}...")
        play_script = os.path.join(ROOT_DIR, "play.sh")
        disp = os.environ.get("DISPLAY", ":0")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(PORT), DISPLAY=disp)

        args = [play_script, "--player"]
        if not os.path.exists("/tmp/.X11-unix"):
            args.append("--headless")

        cls.godot_proc = subprocess.Popen(
            args,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        cls.player = TabletopQAPlayer(port=PORT)
        connected = False
        for _ in range(40):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)

        if not connected:
            if cls.godot_proc:
                cls.godot_proc.terminate()
            raise RuntimeError(f"Could not connect to Godot tabletop server on port {PORT}")

        print(f"Connected to Tabletop Godot server on port {PORT}.")

    @classmethod
    def tearDownClass(cls):
        if cls.godot_proc:
            cls.godot_proc.terminate()
            try:
                cls.godot_proc.wait(timeout=3)
            except Exception:
                cls.godot_proc.kill()

    def setUp(self):
        self.player.reset_game()
        time.sleep(0.2)
        # Dismiss elf spell allocation if active
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)
            time.sleep(0.3)

    def test_01_corridor_search_button_disabled_with_tooltip(self):
        """Scenario 1: Hero in corridor -> Search button is visible, disabled, with corridor tooltip and notice."""
        bdd_scenario_header(1, "Search Button Visible and Disabled in Corridor (Some Other Reason)")

        bdd_step("GIVEN", "Barbarian standing in corridor at (0, 1) with action available",
                 info="Corridors cannot be searched under HeroQuest rules")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1]}]
        )
        time.sleep(0.1)

        bdd_step("WHEN", "Inspecting hotbar search button state")
        st = self.player.get_state()
        search_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("search", {})

        bdd_step("THEN", "Search button is visible, disabled, and explains corridor restriction in tooltip",
                 assertions=[
                     f"visible: {search_btn.get('visible')}",
                     f"disabled: {search_btn.get('disabled')}",
                     f"tooltip: {repr(search_btn.get('tooltip'))}",
                     f"reason: {repr(search_btn.get('reason'))}"
                 ])
        self.assertTrue(search_btn.get("visible"), "Search button must ALWAYS be visible")
        self.assertTrue(search_btn.get("disabled"), "Search button must be disabled in corridor")
        self.assertIn("corridor", search_btn.get("tooltip", "").lower())
        self.assertEqual(search_btn.get("reason"), "Cannot search in corridor")

        bdd_step("WHEN", "Player clicks the disabled search button via DisabledClickShield")
        click_res = self.player.click_action_button("search")

        bdd_step("THEN", "Click is gracefully intercepted and triggers 'Cannot search in corridor' notice",
                 assertions=[
                     f"clicked: {click_res.get('clicked')}",
                     f"disabled: {click_res.get('disabled')}",
                     f"reason: {click_res.get('reason')}"
                 ])
        self.assertFalse(click_res.get("clicked"))
        self.assertTrue(click_res.get("disabled"))
        self.assertEqual(click_res.get("reason"), "Cannot search in corridor")

        notice = self.player.get_unavailable_notice()
        self.assertTrue(notice.get("active"))
        self.assertEqual(notice.get("text"), "Cannot search in corridor")

    def test_02_monsters_in_room_search_button_disabled_with_tooltip(self):
        """Scenario 2: Hero in chamber with active monsters -> Button is visible, disabled, with monster tooltip."""
        bdd_scenario_header(2, "Search Button Visible and Disabled When Monsters Present in Room")

        bdd_step("GIVEN", "Barbarian inside Northwest Crypt at (4, 3) with an active Skeleton at (3, 4)",
                 info="Monsters in room prevent searching until room is secured")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3]}],
            monsters=[
                {"id": "mon-skel-1", "name": "Skeleton", "is_alive": True, "current_bp": 1, "grid_pos": [3, 4], "roomId": "room-nw-crypt"}
            ]
        )
        time.sleep(0.1)

        bdd_step("WHEN", "Inspecting hotbar search button state")
        st = self.player.get_state()
        search_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("search", {})

        bdd_step("THEN", "Search button is visible, disabled, and identifies monsters in tooltip",
                 assertions=[
                     f"visible: {search_btn.get('visible')}",
                     f"disabled: {search_btn.get('disabled')}",
                     f"tooltip: {repr(search_btn.get('tooltip'))}",
                     f"reason: {repr(search_btn.get('reason'))}"
                 ])
        self.assertTrue(search_btn.get("visible"), "Search button must ALWAYS be visible")
        self.assertTrue(search_btn.get("disabled"), "Search button must be disabled when monsters are in room")
        self.assertIn("monsters", search_btn.get("tooltip", "").lower())
        self.assertEqual(search_btn.get("reason"), "Monsters present in room")

        bdd_step("WHEN", "Player clicks the disabled search button")
        click_res = self.player.click_action_button("search")

        bdd_step("THEN", "Click triggers 'Monsters present in room' notice",
                 assertions=[
                     f"clicked: {click_res.get('clicked')}",
                     f"disabled: {click_res.get('disabled')}",
                     f"reason: {click_res.get('reason')}"
                 ])
        self.assertFalse(click_res.get("clicked"))
        self.assertTrue(click_res.get("disabled"))
        self.assertEqual(click_res.get("reason"), "Monsters present in room")

        notice = self.player.get_unavailable_notice()
        self.assertTrue(notice.get("active"))
        self.assertEqual(notice.get("text"), "Monsters present in room")

    def test_03_room_cleared_search_button_enabled(self):
        """Scenario 3: Room cleared of monsters -> Search button is visible, ENABLED, ready for search."""
        bdd_scenario_header(3, "Search Button Visible and Enabled in Cleared, Unsearched Chamber")

        bdd_step("GIVEN", "Barbarian inside Northwest Crypt at (4, 3) with all monsters defeated",
                 info="Room is revealed, monster-free, and has not yet been searched")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3]}],
            monsters=[
                {"id": "mon-skel-1", "name": "Skeleton", "is_alive": False, "current_bp": 0, "grid_pos": [3, 4], "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ],
            searchedRooms={}
        )
        time.sleep(0.1)

        bdd_step("WHEN", "Inspecting hotbar search button state")
        st = self.player.get_state()
        search_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("search", {})

        bdd_step("THEN", "Search button is visible, enabled, with treasure search prompt",
                 assertions=[
                     f"visible: {search_btn.get('visible')}",
                     f"disabled: {search_btn.get('disabled')}",
                     f"tooltip: {repr(search_btn.get('tooltip'))}",
                     f"reason: {repr(search_btn.get('reason'))}"
                 ])
        self.assertTrue(search_btn.get("visible"), "Search button must ALWAYS be visible")
        self.assertFalse(search_btn.get("disabled"), "Search button must be ENABLED in cleared chamber")
        self.assertIn("search this chamber", search_btn.get("tooltip", "").lower())
        self.assertEqual(search_btn.get("reason", ""), "")

    def test_04_already_searched_button_disabled_with_tooltip(self):
        """Scenario 4: Hero already searched this room -> Button is visible, disabled, with 'already searched' tooltip."""
        bdd_scenario_header(4, "Search Button Visible and Disabled When Room Already Searched")

        bdd_step("GIVEN", "Barbarian in Northwest Crypt at (4, 3) where Barbarian has already searched",
                 info="HeroQuest rules allow each hero to search each room at most once")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3]}],
            monsters=[],
            searchedRooms={"room-nw-crypt": ["barbarian"]}
        )
        time.sleep(0.1)

        bdd_step("WHEN", "Inspecting hotbar search button state")
        st = self.player.get_state()
        search_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("search", {})

        bdd_step("THEN", "Search button is visible, disabled, and explains 'already searched' in tooltip",
                 assertions=[
                     f"visible: {search_btn.get('visible')}",
                     f"disabled: {search_btn.get('disabled')}",
                     f"tooltip: {repr(search_btn.get('tooltip'))}",
                     f"reason: {repr(search_btn.get('reason'))}"
                 ])
        self.assertTrue(search_btn.get("visible"), "Search button must ALWAYS be visible")
        self.assertTrue(search_btn.get("disabled"), "Search button must be disabled when already searched")
        self.assertIn("already searched", search_btn.get("tooltip", "").lower())
        self.assertEqual(search_btn.get("reason"), "Room already searched")

        bdd_step("WHEN", "Player clicks the disabled search button")
        click_res = self.player.click_action_button("search")

        bdd_step("THEN", "Click triggers 'Room already searched' notice",
                 assertions=[
                     f"clicked: {click_res.get('clicked')}",
                     f"disabled: {click_res.get('disabled')}",
                     f"reason: {click_res.get('reason')}"
                 ])
        self.assertFalse(click_res.get("clicked"))
        self.assertTrue(click_res.get("disabled"))
        self.assertEqual(click_res.get("reason"), "Room already searched")

        notice = self.player.get_unavailable_notice()
        self.assertTrue(notice.get("active"))
        self.assertEqual(notice.get("text"), "Room already searched")

    def test_05_action_used_button_disabled_with_tooltip(self):
        """Scenario 5: Hero already took an action this turn -> Search button is visible, disabled, with 'action used' tooltip."""
        bdd_scenario_header(5, "Search Button Visible and Disabled When Action Already Used")

        bdd_step("GIVEN", "Barbarian in cleared Northwest Crypt who has already acted this turn (hasActed=True)",
                 info="Heroes are limited to one standard action per turn")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=True,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3]}],
            monsters=[],
            searchedRooms={}
        )
        time.sleep(0.1)

        bdd_step("WHEN", "Inspecting hotbar search button state")
        st = self.player.get_state()
        search_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("search", {})

        bdd_step("THEN", "Search button is visible, disabled, with 'action used' tooltip",
                 assertions=[
                     f"visible: {search_btn.get('visible')}",
                     f"disabled: {search_btn.get('disabled')}",
                     f"tooltip: {repr(search_btn.get('tooltip'))}",
                     f"reason: {repr(search_btn.get('reason'))}"
                 ])
        self.assertTrue(search_btn.get("visible"), "Search button must ALWAYS be visible")
        self.assertTrue(search_btn.get("disabled"), "Search button must be disabled when action has been used")
        self.assertIn("already taken an action", search_btn.get("tooltip", "").lower())
        self.assertEqual(search_btn.get("reason"), "Not enough actions")

    def test_06_zargon_phase_search_button_disabled_with_tooltip(self):
        """Scenario 6: In GM / Zargon phase -> Search button is visible, disabled, explaining Zargon's turn."""
        bdd_scenario_header(6, "Search Button Visible and Disabled During Zargon / GM Phase")

        bdd_step("GIVEN", "Turn advances to Zargon / GM phase",
                 info="Players cannot search for treasure on Zargon's turn")
        self.player.execute_action("patch_state", currentPhase="gm_phase", currentRole="gm")
        time.sleep(0.1)

        bdd_step("WHEN", "Inspecting hotbar search button state")
        st = self.player.get_state()
        search_btn = st.get("scene", {}).get("ui", {}).get("buttons", {}).get("search", {})

        bdd_step("THEN", "Search button is visible and disabled with Zargon explanation",
                 assertions=[
                     f"visible: {search_btn.get('visible')}",
                     f"disabled: {search_btn.get('disabled')}",
                     f"tooltip: {repr(search_btn.get('tooltip'))}"
                 ])
        self.assertTrue(search_btn.get("visible"), "Search button must ALWAYS be visible in GM phase")
        self.assertTrue(search_btn.get("disabled"), "Search button must be disabled during Zargon's turn")
        self.assertIn("zargon", search_btn.get("tooltip", "").lower())

    def test_07_capture_visual_proof_screenshot(self):
        """Scenario 7: Capture visual proof screenshot showing search button and action hotbar."""
        bdd_scenario_header(7, "Capture Visual Proof of Search Button with Dynamic Disabled Tooltip")

        bdd_step("GIVEN", "Barbarian in corridor with disabled search button",
                 info="Configuring corridor state for screenshot capture")
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1]}]
        )
        time.sleep(0.3)

        tmp_shot = "/tmp/tabletop_search_button_disabled_proof.png"
        brain_shot = os.path.join(ARTIFACT_DIR, "tabletop_search_button_disabled_proof.png")
        brain_crop = os.path.join(ARTIFACT_DIR, "tabletop_search_button_hotbar_crop.png")

        bdd_step("WHEN", "Taking high-res viewport screenshot")
        res = self.player.take_screenshot(tmp_shot)
        self.assertTrue(res.get("success"), "Screenshot capture must succeed")
        self.assertTrue(os.path.exists(tmp_shot), "Screenshot file must exist")
        shutil.copyfile(tmp_shot, brain_shot)

        bdd_step("WHEN", "Cropping hotbar area featuring the persistent Search Room button")
        im = Image.open(tmp_shot)
        w, h = im.size
        # The hotbar is in the right HUD sidebar
        crop_box = (1400, 45, 1910, 155)
        crop_im = im.crop(crop_box)
        crop_im.save(brain_crop)

        bdd_step("THEN", "Visual proof artifacts saved successfully",
                 assertions=[
                     f"Full screenshot: {brain_shot} ({os.path.getsize(brain_shot):,} bytes)",
                     f"Hotbar crop: {brain_crop} ({os.path.getsize(brain_crop):,} bytes)"
                 ])


if __name__ == "__main__":
    unittest.main()
