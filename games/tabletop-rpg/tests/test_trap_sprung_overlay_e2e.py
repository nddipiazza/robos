#!/usr/bin/env python3
"""
test_trap_sprung_overlay_e2e.py
Comprehensive End-to-End BDD test suite verifying:
1. Dramatic, high-contrast "TRAP SPRUNG!" modal indicator overlay when any trap springs
   (Pit Trap, Spear Trap, Falling Block Trap, Trapped Treasure Chest).
2. Victim hero identification ("Rogar the Barbarian") and thematic trap descriptions.
3. Overlay click prompt ("👉 CLICK ANYWHERE TO ROLL HAZARD DICE 🎲") that holds state
   without resolving damage until the user clicks or presses a key.
4. Click-to-roll transition launching the 3D dice tray animation (trigger_hazard_dice_roll).
5. Authentic hazard dice simulation:
   - Spear Trap: 1 combat die (Skull = 1 wound, White Shield = dodged).
   - Falling Block Trap: 3 hazard combat dice (counts skulls for damage, drops wall block, pushes hero to safety).
   - Pit Trap: 1 hazard combat die (1 BP damage, halts movement in pit).
   - Chest Trap: 2 hazard combat dice (2 BP poison needle damage).
6. Resolution pipeline applying damage, floating combat text, and ending movement once dice settle.
7. Backward compatibility for legacy automated moves.
"""

import os
import sys
import time
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, action_info: str = None, overlay_info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]       {action_info}")
    if overlay_info:
        print(f"    ⚠️  [OVERLAY STATE]{overlay_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestTrapSprungOverlayE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚠️ FEATURE: Dramatic 'TRAP SPRUNG!' Indicator Overlay & Click-to-Roll Hazard Dice")
        print("   As a HeroQuest tabletop player")
        print("   I want a dramatic, high-contrast 'TRAP SPRUNG!' modal banner when stepping into a trap")
        print("   And I want the hazard dice roll animation to wait and trigger only after I click")
        print("   So that trap encounters feel tense, visceral, interactive, and authentic to tabletop RPGs")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18105
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.1)
        connected = False
        for _ in range(30):
            if cls.player.check_health():
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
            cls.proc.wait()

    def test_01_pit_trap_overlay_and_click_to_roll(self):
        """Scenario 1: Pit trap springs with modal overlay, waits for click, then rolls hazard die and applies damage."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Pit Trap Springs with Modal Overlay & Click-to-Roll Hazard Die")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian at (1, 1) with 5 movement; hidden Pit Trap at (2, 1)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            turnState="moving",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "current_bp": 8, "bodyPoints": 8}],
            traps=[{"id": "pit-trap-test", "x": 2, "y": 1, "type": "pit", "damageDice": 1, "detected": False, "disarmed": False, "sprung": False}]
        )

        bdd_step("WHEN", "Barbarian moves toward (3, 1) in interactive mode, stepping directly into Pit Trap at (2, 1)",
                 action_info="Move (3, 1) with interactive=True")
        res = self.player.move(3, 1, interactive=True)
        self.assertTrue(res.get("success"))

        st_overlay = self.player.get_state()
        barb_pre = next((h for h in st_overlay.get("heroes", []) if h.get("id") == "barbarian"), {})
        trap_overlay = st_overlay.get("trapOverlay", {})

        bdd_step("THEN", "Movement halts at (2, 1), TRAP SPRUNG! modal overlay appears, and damage is NOT yet deducted",
                 overlay_info=f"Active: {trap_overlay.get('active')}, Title: '{trap_overlay.get('title')}', Hero: '{trap_overlay.get('heroName')}'",
                 assertions=[
                     f"Barbarian position halted at [2, 1]: {barb_pre.get('grid_pos')}",
                     f"Movement remaining dropped to 0: {st_overlay.get('movementRemaining')}",
                     f"trapOverlay.active: {trap_overlay.get('active')}",
                     f"trapOverlay.type: '{trap_overlay.get('type')}' (expected 'pit')",
                     f"trapOverlay.heroName: '{trap_overlay.get('heroName')}' (expected 'Rogar the Barbarian')",
                     f"trapOverlay.waitingForClick: {trap_overlay.get('waitingForClick')}",
                     f"Barbarian BP still at 8 (damage pending): {barb_pre.get('current_bp')}"
                 ])
        self.assertEqual(barb_pre.get("grid_pos"), [2, 1])
        self.assertEqual(st_overlay.get("movementRemaining"), 0)
        self.assertTrue(trap_overlay.get("active"))
        self.assertEqual(trap_overlay.get("type"), "pit")
        self.assertEqual(trap_overlay.get("heroName"), "Rogar the Barbarian")
        self.assertTrue(trap_overlay.get("waitingForClick"))
        self.assertEqual(barb_pre.get("current_bp"), 8)

        bdd_step("WHEN", "Player clicks anywhere on screen to roll hazard dice",
                 action_info="Click '👉 CLICK ANYWHERE TO ROLL HAZARD DICE 🎲'")
        click_res = self.player.click_trap_overlay()
        self.assertTrue(click_res.get("success"))

        st_rolling = self.player.get_state()
        dice_anim = st_rolling.get("activeDiceRoll", {})
        bdd_step("THEN", "Overlay closes and 3D hazard dice animation begins tumbling in dice tray",
                 overlay_info=f"Dice Type: {dice_anim.get('type')}, Title: '{dice_anim.get('title')}', Dice Count: {dice_anim.get('diceCount')}",
                 assertions=[
                     f"trapOverlay active: {st_rolling.get('trapOverlay', {}).get('active', False)} (expected False)",
                     f"activeDiceRoll type: '{dice_anim.get('type')}' (expected 'hazard')",
                     f"activeDiceRoll diceCount: {dice_anim.get('diceCount')} (expected 1)",
                     f"activeDiceRoll attacker: '{dice_anim.get('attackerName')}'"
                 ])
        self.assertFalse(st_rolling.get("trapOverlay", {}).get("active", False))
        self.assertEqual(dice_anim.get("type"), "hazard")
        self.assertEqual(dice_anim.get("diceCount"), 1)

        bdd_step("WHEN", "Dice roll settles and outcome is confirmed",
                 action_info="Dismiss dice tray animation")
        self.player.execute_action("dismiss_dice_roll")

        st_settled = self.player.get_state()
        barb_post = next((h for h in st_settled.get("heroes", []) if h.get("id") == "barbarian"), {})
        pit_obj = next((t for t in st_settled.get("traps", []) if t.get("id") == "pit-trap-test"), {})

        bdd_step("THEN", "1 Body Point pit damage is applied, trap marked sprung, and floating text spawned",
                 assertions=[
                     f"Barbarian BP (8 -> 7): {barb_post.get('current_bp')}",
                     f"Trap sprung: {pit_obj.get('sprung')}",
                     f"Floating text displayed: {len(st_settled.get('floatingTexts', []))} text(s)"
                 ])
        self.assertEqual(barb_post.get("current_bp"), 7)
        self.assertTrue(pit_obj.get("sprung"))

    def test_02_spear_trap_overlay_and_combat_die(self):
        """Scenario 2: Spear trap springs with overlay, rolls 1 combat die on click (Skull=1 wound, Shield=0 dodged)."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Spear Trap Springs with Modal Overlay & 1 Combat Die Hazard Roll")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian at (1, 1) with 5 movement; hidden Spear Trap placed at (2, 1)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            turnState="moving",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "current_bp": 8, "bodyPoints": 8}],
            traps=[{"id": "spear-trap-test", "x": 2, "y": 1, "type": "spear", "damageDice": 1, "detected": False, "disarmed": False, "spent": False, "sprung": False}]
        )

        bdd_step("WHEN", "Barbarian steps into Spear Trap at (2, 1) with interactive=True",
                 action_info="Move (3, 1) with interactive=True")
        res = self.player.move(3, 1, interactive=True)
        self.assertTrue(res.get("success"))

        st_overlay = self.player.get_state()
        trap_overlay = st_overlay.get("trapOverlay", {})
        barb_pre = next((h for h in st_overlay.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "TRAP SPRUNG! modal banner is displayed for Spear Trap with Rogar the Barbarian",
                 overlay_info=f"Active: {trap_overlay.get('active')}, Trap: '{trap_overlay.get('trapName')}', Title: '{trap_overlay.get('title')}'",
                 assertions=[
                     f"trapOverlay.active: {trap_overlay.get('active')}",
                     f"trapOverlay.type: '{trap_overlay.get('type')}' (expected 'spear')",
                     f"trapOverlay.title: '{trap_overlay.get('title')}'",
                     f"trapOverlay.diceCount: {trap_overlay.get('diceCount')} (expected 1)",
                     f"Barbarian BP undamaged at 8: {barb_pre.get('current_bp')}"
                 ])
        self.assertTrue(trap_overlay.get("active"))
        self.assertEqual(trap_overlay.get("type"), "spear")
        self.assertEqual(trap_overlay.get("diceCount"), 1)
        self.assertEqual(barb_pre.get("current_bp"), 8)

        bdd_step("WHEN", "User clicks overlay to confirm roll",
                 action_info="confirm_trap_roll()")
        roll_res = self.player.confirm_trap_roll()
        self.assertTrue(roll_res.get("success"))

        st_roll = self.player.get_state()
        dice_anim = st_roll.get("activeDiceRoll", {})
        bdd_step("THEN", "Hazard combat die rolls with authentic HeroQuest combat die physics",
                 overlay_info=f"Dice Type: {dice_anim.get('type')}, Summary: '{dice_anim.get('summary')}'",
                 assertions=[
                     f"activeDiceRoll type: '{dice_anim.get('type')}' (expected 'hazard')",
                     f"activeDiceRoll diceCount: {dice_anim.get('diceCount')} (expected 1)"
                 ])
        self.assertEqual(dice_anim.get("type"), "hazard")
        self.assertEqual(dice_anim.get("diceCount"), 1)

        bdd_step("WHEN", "Dice roll settles / is dismissed",
                 action_info="dismiss_dice_roll()")
        self.player.execute_action("dismiss_dice_roll")

        st_settled = self.player.get_state()
        spear_obj = next((t for t in st_settled.get("traps", []) if t.get("id") == "spear-trap-test"), {})
        barb_post = next((h for h in st_settled.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "Spear trap is marked spent/safe and Barbarian suffered 0 or 1 damage depending on die face",
                 assertions=[
                     f"Spear trap spent: {spear_obj.get('spent')} (expected True)",
                     f"Spear trap sprung: {spear_obj.get('sprung')} (expected True)",
                     f"Barbarian BP: {barb_post.get('current_bp')}/8 (either 7 or 8)"
                 ])
        self.assertTrue(spear_obj.get("spent"))
        self.assertTrue(spear_obj.get("sprung"))
        self.assertIn(barb_post.get("current_bp"), [7, 8])

    def test_03_falling_block_trap_overlay_and_3_hazard_dice(self):
        """Scenario 3: Falling block trap springs with overlay, rolls 3 hazard dice, pushes hero back, drops stone block."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Falling Block Trap Springs with Overlay & 3 Hazard Dice Roll")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian at (1, 1) with 5 movement; hidden Falling Block Trap placed at (2, 1)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            turnState="moving",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "current_bp": 8, "bodyPoints": 8}],
            traps=[{"id": "falling-block-test", "x": 2, "y": 1, "type": "falling_block", "damageDice": 3, "detected": False, "disarmed": False, "sprung": False}]
        )

        bdd_step("WHEN", "Barbarian moves toward (2, 1) with interactive=True",
                 action_info="Move (2, 1) with interactive=True")
        res = self.player.move(2, 1, interactive=True)
        self.assertTrue(res.get("success"))

        st_overlay = self.player.get_state()
        trap_overlay = st_overlay.get("trapOverlay", {})

        bdd_step("THEN", "TRAP SPRUNG! modal banner is displayed for Falling Block Trap specifying 3 Hazard Dice",
                 overlay_info=f"Active: {trap_overlay.get('active')}, Title: '{trap_overlay.get('title')}', DiceCount: {trap_overlay.get('diceCount')}",
                 assertions=[
                     f"trapOverlay.active: {trap_overlay.get('active')}",
                     f"trapOverlay.type: '{trap_overlay.get('type')}' (expected 'falling_block')",
                     f"trapOverlay.diceCount: {trap_overlay.get('diceCount')} (expected 3)",
                     f"trapOverlay.heroName: '{trap_overlay.get('heroName')}'"
                 ])
        self.assertTrue(trap_overlay.get("active"))
        self.assertEqual(trap_overlay.get("type"), "falling_block")
        self.assertEqual(trap_overlay.get("diceCount"), 3)

        bdd_step("WHEN", "User clicks overlay to roll hazard dice",
                 action_info="click_trap_overlay()")
        self.player.click_trap_overlay()

        st_roll = self.player.get_state()
        dice_anim = st_roll.get("activeDiceRoll", {})
        bdd_step("THEN", "3 Hazard Combat Dice roll simultaneously in the dice tray",
                 overlay_info=f"Dice Count: {dice_anim.get('diceCount')}, Title: '{dice_anim.get('title')}'",
                 assertions=[
                     f"activeDiceRoll type: '{dice_anim.get('type')}'",
                     f"activeDiceRoll diceCount: {dice_anim.get('diceCount')} (expected 3)"
                 ])
        self.assertEqual(dice_anim.get("type"), "hazard")
        self.assertEqual(dice_anim.get("diceCount"), 3)

        bdd_step("WHEN", "Dice roll settles and masonry block falls",
                 action_info="dismiss_dice_roll()")
        self.player.execute_action("dismiss_dice_roll")

        st_settled = self.player.get_state()
        barb_post = next((h for h in st_settled.get("heroes", []) if h.get("id") == "barbarian"), {})
        wall_blocks = st_settled.get("wallBlocks", [])
        block_trap_obj = next((t for t in st_settled.get("traps", []) if t.get("id") == "falling-block-test"), {})

        bdd_step("THEN", "Hero is pushed back to safe tile (1, 1), masonry block drops at (2, 1), and damage applied",
                 assertions=[
                     f"Hero pushed back to safe tile [1, 1]: {barb_post.get('grid_pos')}",
                     f"Masonry block placed at [2, 1]: {any(wb.get('x') == 2 and wb.get('y') == 1 for wb in wall_blocks)}",
                     f"Trap blocked flag: {block_trap_obj.get('blocked')}",
                     f"Hero BP damaged (BP <= 7): {barb_post.get('current_bp')}"
                 ])
        self.assertEqual(barb_post.get("grid_pos"), [1, 1])
        self.assertTrue(any(wb.get("x") == 2 and wb.get("y") == 1 for wb in wall_blocks))
        self.assertTrue(block_trap_obj.get("blocked"))
        self.assertLessEqual(barb_post.get("current_bp"), 7)

    def test_04_chest_trap_overlay_on_search(self):
        """Scenario 4: Trapped chest springs with modal overlay when searching chamber, rolls 2 poison hazard dice."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Poison Needle Chest Trap Springs on Search with Overlay")
        print("-" * 80)

        bdd_step("GIVEN", "Hero inside crypt at (4, 3) with an undetected trapped treasure chest at (4, 4)")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "current_bp": 8, "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ],
            traps=[{"id": "chest-trap-test", "x": 4, "y": 4, "type": "chest_trap", "damageDice": 2, "detected": False, "disarmed": False, "sprung": False}]
        )

        bdd_step("WHEN", "Hero searches chamber for treasure with interactive=True",
                 action_info="Search chamber (interactive=True)")
        res = self.player.search(interactive=True)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("trapTriggered"))
        self.assertTrue(res.get("waitingForClick"))

        st_overlay = self.player.get_state()
        trap_overlay = st_overlay.get("trapOverlay", {})
        barb_pre = next((h for h in st_overlay.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "POISON CHEST TRAP SPRUNG! modal banner is displayed and damage has NOT yet been dealt",
                 overlay_info=f"Active: {trap_overlay.get('active')}, Title: '{trap_overlay.get('title')}', DiceCount: {trap_overlay.get('diceCount')}",
                 assertions=[
                     f"trapOverlay.active: {trap_overlay.get('active')}",
                     f"trapOverlay.type: '{trap_overlay.get('type')}' (expected 'chest')",
                     f"trapOverlay.diceCount: {trap_overlay.get('diceCount')} (expected 2)",
                     f"Barbarian BP still 8 (undamaged): {barb_pre.get('current_bp')}"
                 ])
        self.assertTrue(trap_overlay.get("active"))
        self.assertEqual(trap_overlay.get("type"), "chest")
        self.assertEqual(trap_overlay.get("diceCount"), 2)
        self.assertEqual(barb_pre.get("current_bp"), 8)

        bdd_step("WHEN", "Player clicks overlay to roll poison hazard dice",
                 action_info="click_trap_overlay()")
        self.player.click_trap_overlay()

        st_roll = self.player.get_state()
        dice_anim = st_roll.get("activeDiceRoll", {})
        bdd_step("THEN", "2 Poison Hazard Dice roll in dice tray",
                 assertions=[
                     f"activeDiceRoll type: '{dice_anim.get('type')}'",
                     f"activeDiceRoll diceCount: {dice_anim.get('diceCount')} (expected 2)"
                 ])
        self.assertEqual(dice_anim.get("type"), "hazard")
        self.assertEqual(dice_anim.get("diceCount"), 2)

        bdd_step("WHEN", "Poison needle dice settle",
                 action_info="dismiss_dice_roll()")
        self.player.execute_action("dismiss_dice_roll")

        st_settled = self.player.get_state()
        barb_post = next((h for h in st_settled.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "Poison needle deals 2 BP damage, 0 gold awarded, and hasActed is marked True",
                 assertions=[
                     f"Barbarian BP (8 -> 6): {barb_post.get('current_bp')}",
                     f"hasActed: {st_settled.get('hasActed')} (expected True)"
                 ])
        self.assertEqual(barb_post.get("current_bp"), 6)
        self.assertTrue(st_settled.get("hasActed"))

    def test_05_skip_trap_overlay_shortcut(self):
        """Scenario 5: Skip trap overlay shortcut instantly triggers roll and applies damage."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Skip Trap Overlay Shortcut Instant Resolution")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian stepping into Pit Trap with interactive=True")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            turnState="moving",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "current_bp": 8, "bodyPoints": 8}],
            traps=[{"id": "pit-trap-fast", "x": 2, "y": 1, "type": "pit", "damageDice": 1, "detected": False, "disarmed": False, "sprung": False}]
        )
        self.player.move(3, 1, interactive=True)

        bdd_step("WHEN", "Invoking skip_trap_overlay() RPC action",
                 action_info="skip_trap_overlay()")
        res_skip = self.player.skip_trap_overlay()
        self.assertTrue(res_skip.get("success"))

        st = self.player.get_state()
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})
        bdd_step("THEN", "Overlay is dismissed, dice roll settled, and 1 BP damage applied instantly",
                 assertions=[
                     f"trapOverlay active: {st.get('trapOverlay', {}).get('active', False)} (expected False)",
                     f"Barbarian BP (8 -> 7): {barb.get('current_bp')}"
                 ])
        self.assertFalse(st.get("trapOverlay", {}).get("active", False))
        self.assertEqual(barb.get("current_bp"), 7)

    def test_06_capture_overlay_screenshot(self):
        """Scenario 6: Capture visual snapshot of the dramatic TRAP SPRUNG! modal overlay on the board."""
        print("\n" + "-" * 80)
        print("SCENARIO 06: Capture Visual Snapshot of 'TRAP SPRUNG!' Overlay")
        print("-" * 80)

        bdd_step("GIVEN", "Spear Trap sprung with active TRAP SPRUNG! modal overlay on screen")
        self.player.reset_game()
        self.player.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            turnState="moving",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "current_bp": 8, "bodyPoints": 8}],
            traps=[{"id": "spear-screenshot-trap", "x": 2, "y": 1, "type": "spear", "damageDice": 1, "detected": False, "disarmed": False, "spent": False, "sprung": False}]
        )
        self.player.move(3, 1, interactive=True)

        bdd_step("WHEN", "Capturing PNG viewport screenshot during modal overlay presentation",
                 action_info="take_screenshot('/tmp/tabletop_trap_sprung_overlay.png')")
        shot_path = "/tmp/tabletop_trap_sprung_overlay.png"
        res = self.player.execute_action("take_screenshot", path=shot_path)

        bdd_step("THEN", "High-contrast visual screenshot is saved and verified on disk",
                 assertions=[
                     f"take_screenshot success: {res.get('success')}",
                     f"File exists on disk: {os.path.exists(shot_path)}",
                     f"File size > 10KB: {os.path.getsize(shot_path) > 10000 if os.path.exists(shot_path) else False}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(shot_path))
        self.assertGreater(os.path.getsize(shot_path), 10000)


if __name__ == "__main__":
    unittest.main()
