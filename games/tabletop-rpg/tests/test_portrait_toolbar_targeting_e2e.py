#!/usr/bin/env python3
"""
==========================================================================================
⚔️ FEATURE: Baldur's Gate 1 Style Portrait Toolbar Targeting Mode & Cursor Overlay E2E Test Suite
   As a HeroQuest tabletop player
   When I click on a spell, item, or attack icon from the character portrait toolbars
   I expect any open dialog boxes to close immediately (just like BG1)
   And the mouse pointer to display a reticle plus token/icon badge for the action
   While targeting mode is toggled on with board highlights and target locks
   So that I can smoothly select the target of the spell, item, or weapon attack.
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


class TestPortraitToolbarTargetingE2E(unittest.TestCase):
    """BDD End-to-End tests verifying BG1-style portrait toolbar targeting mode and cursor overlay."""

    proc = None
    ai = None
    port = 18125

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚔️ BALDUR'S GATE 1 STYLE PORTRAIT TOOLBAR TARGETING MODE & CURSOR OVERLAY E2E")
        print("=" * 90)
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopQAPlayer(port=cls.port, human_delay=0.15)
        if not cls.ai.wait_for_ready(timeout=14.0):
            if cls.proc:
                cls.proc.kill()
            raise RuntimeError(f"Godot Tabletop server failed to start on port {cls.port}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            try:
                cls.proc.terminate()
                cls.proc.wait(timeout=3.0)
            except Exception:
                cls.proc.kill()
        print("\n" + "=" * 90)
        print("✔ ALL BALDUR'S GATE 1 TARGETING TESTS COMPLETED CLEANLY")
        print("=" * 90)

    def setUp(self):
        self.ai.execute_action("reset_game")
        # Complete initial elf spell selection if modal is open
        st = self.ai.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.ai.select_elf_element("water", confirm=True)
        # Cancel any active targeting or modals
        self.ai.cancel_targeting()
        self.ai.close_all_dialogs()

    def test_01_clicking_toolbar_spell_closes_dialogs_and_toggles_targeting(self):
        """Clicking spell from portrait toolbar closes dialog boxes and activates BG1 targeting mode."""
        bdd_step("GIVEN", "The player is on the game board and opens the hero detail modal")
        self.ai.execute_action("open_hero_detail", heroId="barbarian")
        st = self.ai.get_state()
        self.assertTrue(st.get("heroDetailModalOpen", False), "Hero detail modal should be open initially")

        bdd_step("WHEN", "Player clicks the 'ball_of_flame' spell on the Wizard's portrait toolbar",
                 action_info="click_toolbar_icon(wizard, ball_of_flame, spell)")
        res = self.ai.click_toolbar_icon("wizard", "ball_of_flame", "spell")
        self.assertTrue(res.get("success", False), f"Toolbar click failed: {res}")

        st = self.ai.get_state()
        tgt = st.get("activeTargeting", {})

        bdd_step("THEN", "All dialog boxes are closed immediately",
                 assertions=[
                     "heroDetailModalOpen is False",
                     "spellPanelOpen is False",
                     "itemPanelOpen is False"
                 ])
        self.assertFalse(st.get("heroDetailModalOpen", False), "Hero detail modal must close on action selection")
        self.assertFalse(st.get("spellPanelOpen", False), "Spell panel modal must be closed")
        self.assertFalse(st.get("itemPanelOpen", False), "Item panel modal must be closed")

        bdd_step("AND", "Active targeting is toggled ON with spell metadata",
                 assertions=[
                     f"active: {tgt.get('active')}",
                     f"type: {tgt.get('type')}",
                     f"id: {tgt.get('id')}",
                     f"name: {tgt.get('name')}",
                     f"targetType: {tgt.get('targetType')}"
                 ])
        self.assertTrue(tgt.get("active", False), "Targeting must be active")
        self.assertEqual(tgt.get("type"), "spell")
        self.assertEqual(tgt.get("id"), "ball_of_flame")
        self.assertEqual(tgt.get("targetType"), "monster")

    def test_02_toggling_targeting_off(self):
        """Clicking same toolbar icon again or cancelling deactivates targeting cleanly."""
        bdd_step("GIVEN", "Targeting is active for 'ball_of_flame'")
        self.ai.start_targeting("spell", "ball_of_flame", "wizard")
        st = self.ai.get_state()
        self.assertTrue(st.get("activeTargeting", {}).get("active", False))

        bdd_step("WHEN", "Player clicks the same spell icon again to toggle it off",
                 action_info="toggle_targeting(spell, ball_of_flame, wizard)")
        self.ai.toggle_targeting("spell", "ball_of_flame", "wizard")
        st = self.ai.get_state()
        tgt = st.get("activeTargeting", {})

        bdd_step("THEN", "Targeting mode is toggled OFF",
                 assertions=["activeTargeting.active is False"])
        self.assertFalse(tgt.get("active", False), "Targeting should be toggled off")

        bdd_step("WHEN", "Player starts targeting again and right-clicks/cancels",
                 action_info="cancel_targeting()")
        self.ai.start_targeting("spell", "ball_of_flame", "wizard")
        self.assertTrue(self.ai.get_state().get("activeTargeting", {}).get("active", False))
        self.ai.cancel_targeting()
        self.assertFalse(self.ai.get_state().get("activeTargeting", {}).get("active", False))

    def test_03_selecting_target_monster_on_board_executes_spell(self):
        """Selecting a monster target on the board casts the spell and concludes targeting."""
        bdd_step("GIVEN", "Wizard is active hero in corridor with line of sight to a Goblin")
        # Place wizard and a monster in corridor with clear LOS
        self.ai.set_state(
            active_hero="wizard",
            has_acted_this_turn=False,
            heroes=[
                {"id": "wizard", "grid_pos": [1, 2], "is_on_board": True, "spells": ["ball_of_flame"]}
            ],
            monsters=[
                {"id": "test_goblin", "name": "Goblin", "grid_pos": [1, 5], "current_bp": 2, "bodyPoints": 2, "is_alive": True}
            ],
            explored_tiles=[[1, 2], [1, 3], [1, 4], [1, 5]]
        )

        bdd_step("WHEN", "Player starts targeting Ball of Flame and clicks monster tile [1, 5]",
                 action_info="start_targeting + select_target(tile=[1, 5])")
        self.ai.start_targeting("spell", "ball_of_flame", "wizard")
        self.assertTrue(self.ai.is_targeting_active())

        res = self.ai.select_target(tile=[1, 5])
        self.assertTrue(res.get("success", False), f"Select target failed: {res}")

        bdd_step("THEN", "The spell is cast on the Goblin and targeting concludes",
                 assertions=[
                     "Spell executed successfully",
                     f"Target ID: {res.get('target')}",
                     "Targeting mode closed (active == False)"
                 ])
        self.assertEqual(res.get("target"), "test_goblin")
        self.assertFalse(self.ai.is_targeting_active(), "Targeting mode must conclude after target selected")

    def test_04_using_healing_potion_from_toolbar_heals_target_hero(self):
        """Clicking healing potion on toolbar targets injured hero and restores Body Points."""
        bdd_step("GIVEN", "Barbarian is wounded at 4/8 BP and active hero carries a healing_potion")
        self.ai.set_state(
            active_hero="barbarian",
            has_acted_this_turn=False,
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [2, 2], "is_on_board": True, "current_bp": 4, "bodyPoints": 8, "inventory": ["healing_potion"]}
            ]
        )

        bdd_step("WHEN", "Player clicks healing_potion on portrait toolbar",
                 action_info="click_toolbar_icon(barbarian, healing_potion, item)")
        res = self.ai.click_toolbar_icon("barbarian", "healing_potion", "item")
        self.assertTrue(res.get("success", False))

        st = self.ai.get_state()
        tgt = st.get("activeTargeting", {})
        self.assertTrue(tgt.get("active", False))
        self.assertEqual(tgt.get("targetType"), "hero", "Healing potion must target hero")

        bdd_step("WHEN", "Player selects Barbarian as the target hero",
                 action_info="select_target(target_id=barbarian)")
        h_res = self.ai.select_target(target_id="barbarian", target_type="hero")
        self.assertTrue(h_res.get("success", False), f"Potion use failed: {h_res}")

        bdd_step("THEN", "Barbarian is healed by 4 BP and targeting concludes",
                 assertions=[
                     f"Healed: {h_res.get('healed')} BP",
                     f"New BP: {h_res.get('current_bp')}/8",
                     "activeTargeting.active is False"
                 ])
        self.assertEqual(h_res.get("current_bp"), 8)
        self.assertFalse(self.ai.is_targeting_active())

    def test_05_starting_targeting_from_hero_detail_modal_closes_modal(self):
        """Starting targeting from within character sheet modal immediately closes modal."""
        bdd_step("GIVEN", "Hero detail modal is open for Telor the Wizard")
        self.ai.execute_action("open_hero_detail", heroId="wizard")
        st = self.ai.get_state()
        self.assertTrue(st.get("heroDetailModalOpen", False))

        bdd_step("WHEN", "Player clicks a spell/item to start targeting",
                 action_info="start_targeting(spell, fire_of_wrath, wizard)")
        self.ai.start_targeting("spell", "fire_of_wrath", "wizard")

        st = self.ai.get_state()
        bdd_step("THEN", "Hero detail modal is closed immediately and targeting is active",
                 assertions=[
                     "heroDetailModalOpen is False",
                     "activeTargeting.active is True",
                     "activeTargeting.id == fire_of_wrath"
                 ])
        self.assertFalse(st.get("heroDetailModalOpen", False))
        self.assertTrue(st.get("activeTargeting", {}).get("active", False))
        self.assertEqual(st.get("activeTargeting", {}).get("id"), "fire_of_wrath")


if __name__ == "__main__":
    unittest.main()
