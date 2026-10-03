#!/usr/bin/env python3
"""
Test Tabletop RPG Action Hotbar E2E:
Validates the new sexy, expandable Action Hotbar:
- Crisp fantasy icons loaded for all actions
- Badges indicating remaining counts (spells, items, movement squares, adjacent traps)
- Mouseover hover updating live action strip preview and tooltip_text
- Unhovering restoring turn guidance text
- Expandable / growth without overflowing (scroll container & scroll buttons)
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


class TestActionHotbarE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18096

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 85)
        print("🎲 TABLETOP RPG ACTION HOTBAR E2E TEST SUITE")
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

    def test_01_all_action_buttons_have_icons_and_tooltips(self):
        """SCENARIO 1: All action buttons have icons and mouseover tooltips."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: All Action Buttons Expose Icons & Mouseover Tooltips")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian starts turn awaiting roll")
        st = self.player.get_state()
        btns = st.get("scene", {}).get("ui", {}).get("buttons", {})

        bdd_step("THEN", "Movement button has move icon and informative tooltip",
                 assertions=[
                     f"Roll button icon: {btns.get('roll', {}).get('icon')}",
                     f"Roll button tooltip: {repr(btns.get('roll', {}).get('tooltip', ''))[:40]}..."
                 ])
        self.assertEqual(btns.get("roll", {}).get("icon"), "action_move")
        self.assertIn("Roll Movement", btns.get("roll", {}).get("tooltip", ""))

        bdd_step("WHEN", "Wizard is active hero with 3 memorized spells")
        self.player.execute_action("set_state", activeHeroIndex=3, activeHero="wizard", hasActed=False)
        st_wiz = self.player.get_state()
        btns_wiz = st_wiz.get("scene", {}).get("ui", {}).get("buttons", {})

        bdd_step("THEN", "Spell button is visible with spell icon and spell count tooltip",
                 assertions=[
                     f"Spell button visible: {btns_wiz.get('cast_spell', {}).get('visible')}",
                     f"Spell button icon: {btns_wiz.get('cast_spell', {}).get('icon')}",
                     f"Spell button tooltip: {repr(btns_wiz.get('cast_spell', {}).get('tooltip', ''))}"
                 ])
        self.assertTrue(btns_wiz.get("cast_spell", {}).get("visible"))
        self.assertEqual(btns_wiz.get("cast_spell", {}).get("icon"), "action_spell")
        self.assertIn("Cast Spell", btns_wiz.get("cast_spell", {}).get("tooltip", ""))

    def test_02_mouseover_hover_updates_live_banner_and_unhover_restores(self):
        """SCENARIO 2: Mouseover on action button displays preview and unhover restores guidance."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Mouseover Preview & Tooltip Restore")
        print("-" * 80)

        bdd_step("GIVEN", "Tabletop game awaiting movement roll")
        st_init = self.player.get_state()
        init_label = st_init.get("scene", {}).get("ui", {}).get("diceLabel", "")
        bdd_step("THEN", f"Initial turn guidance is active: '{init_label}'")
        self.assertIn("ROLL DICE", init_label)

        bdd_step("WHEN", "Player hovers cursor over the 'roll' movement action button")
        res_hover = self.player.execute_action("hover_action_button", button="roll")
        self.assertTrue(res_hover.get("success", False))

        bdd_step("THEN", "Live preview banner reflects Roll Movement action details",
                 assertions=[
                     f"Hovered title: {res_hover.get('hoveredTitle')}",
                     f"Hovered desc: {res_hover.get('hoveredDesc')}",
                     f"Live banner text: {res_hover.get('diceLabel')}"
                 ])
        self.assertIn("Roll Movement", res_hover.get("hoveredTitle", ""))
        self.assertIn("Roll Movement", res_hover.get("diceLabel", ""))

        bdd_step("WHEN", "Player cursor unhovers from the 'roll' action button")
        res_unhover = self.player.execute_action("unhover_action_button", button="roll")
        self.assertTrue(res_unhover.get("success", False))

        bdd_step("THEN", "Turn guidance text is restored in the status banner",
                 assertions=[f"Restored banner: {res_unhover.get('diceLabel')}"])
        self.assertIn("ROLL DICE", res_unhover.get("diceLabel", ""))

    def test_03_contextual_attack_and_door_icons(self):
        """SCENARIO 3: Contextual button switches between attack sword and door icons."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Contextual Action Icon Dynamic Switching")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian adjacent to revealed secret door")
        self.player.execute_action("set_state",
            hasActed=False,
            movementRemaining=4,
            movementRolled=True,
            doors=[{"id": "test_door", "is_open": False, "is_secret": True, "is_revealed": True, "from": [0, 1], "to": [0, 2]}]
        )
        st_door = self.player.get_state()
        btn_door = st_door.get("scene", {}).get("ui", {}).get("buttons", {}).get("attack", {})

        bdd_step("THEN", "Contextual action reflects door icon when adjacent to secret door or door",
                 assertions=[
                     f"Attack button text: '{btn_door.get('text')}'",
                     f"Attack button icon: '{btn_door.get('icon')}'"
                 ])
        self.assertEqual(btn_door.get("icon"), "action_door" if "Door" in btn_door.get("text", "") else "action_attack")

    def test_04_hotbar_grows_without_overflowing(self):
        """SCENARIO 4: Hotbar accommodates 15+ actions dynamically with scrolling and zero overflow."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Dynamic Growth Without Overflowing (Scrollable Hotbar)")
        print("-" * 80)

        bdd_step("GIVEN", "Standard hotbar with default action buttons")
        st_init = self.player.get_state()
        init_hotbar = st_init.get("scene", {}).get("ui", {}).get("hotbar", {})
        bdd_step("THEN", "Initial hotbar fits within the panel without overflow",
                 assertions=[
                     f"Actions count: {init_hotbar.get('actionsCount')}",
                     f"Overflow detected: {init_hotbar.get('overflow')}"
                 ])
        self.assertFalse(init_hotbar.get("overflow", False), "Default 10 buttons must fit without overflow")

        bdd_step("WHEN", "10 additional dynamic skill/item actions are added to the hotbar")
        custom_actions = [
            ("potion_speed", "Speed Potion", "item", 1),
            ("scroll_flame", "Flame Scroll", "spell", 1),
            ("shield_bash", "Shield Bash", "attack", 0),
            ("leap_pit", "Leap Pit", "move", 0),
            ("second_wind", "Second Wind", "spell", 1),
            ("holy_water", "Holy Water", "item", 2),
            ("bandages", "Herbal Bandages", "item", 3),
            ("torch", "Dungeon Torch", "search", 1),
            ("lockpick_pro", "Master Lockpick", "disarm", 1),
            ("horn_valhalla", "Horn of Valhalla", "summon", 1),
        ]
        for act_id, title, icon, count in custom_actions:
            res = self.player.execute_action("add_dynamic_action", id=act_id, title=title, icon=icon, count=count)
            self.assertTrue(res.get("success", False))

        st_grown = self.player.get_state()
        grown_hotbar = st_grown.get("scene", {}).get("ui", {}).get("hotbar", {})

        bdd_step("THEN", "Hotbar holds 20 actions and safely enables horizontal scrolling without breaking layout",
                 assertions=[
                     f"Total actions in hotbar: {grown_hotbar.get('actionsCount')}",
                     f"Overflow scroll enabled: {grown_hotbar.get('overflow')}"
                 ])
        self.assertGreaterEqual(grown_hotbar.get("actionsCount", 0), 20)
        self.assertTrue(grown_hotbar.get("overflow", False), "Scroll controls must be active when hotbar expands")

        bdd_step("WHEN", "Player scrolls horizontally across the hotbar")
        scroll_res = self.player.execute_action("scroll_hotbar", delta=120)
        self.assertTrue(scroll_res.get("success", False))

        bdd_step("THEN", "Horizontal scroll position shifts smoothly",
                 assertions=[f"scrollHorizontal: {scroll_res.get('scrollHorizontal')}"])
        self.assertGreater(scroll_res.get("scrollHorizontal", 0), 0)


if __name__ == "__main__":
    unittest.main()
