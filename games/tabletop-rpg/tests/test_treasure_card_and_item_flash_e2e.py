#!/usr/bin/env python3
"""
test_treasure_card_and_item_flash_e2e.py
BDD E2E test suite verifying:
1. Authentic vertical parchment HeroQuest treasure cards matching the authentic playing card format.
2. Immediate item/gold flashing when treasure is collected while already out of movement.
3. Pending item queuing when treasure is collected with movement remaining, and immediate flashing
   the exact moment the hero's movement squares drop to 0.
4. Flashing triggered on turn end or trap interruption if pending items exist.
5. Screenshot capture for visual proof-of-work.
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


def bdd_step(step_type: str, text: str, action_info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]    {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION] {a}")


class TestTreasureCardAndItemFlashE2E(unittest.TestCase):
    proc = None
    ai = None
    port = 18109

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("📜 AUTHENTIC PARCHMENT TREASURE CARDS & ITEM FLASH ON OUT OF MOVEMENT E2E SUITE")
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
        for _ in range(30):
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
        self.ai.reset_game()
        time.sleep(0.2)

    def test_01_immediate_flash_when_out_of_movement_after_moving(self):
        """When hero has moved before searching, taking the search action concludes movement,
        so collecting the card immediately flashes the new item/gold!"""
        print("\n=====================================================================================")
        print("🎲 TEST 01: Immediate Item Flash When Out of Movement (Searched After Moving)")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian moved into Northwest Crypt at (4, 3) and is out of movement (0 remaining)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            movedBeforeAction=True,
            movementRemaining=0,
            movementClosed=True,
            turnState="turn_complete",
            revealedRooms=["room-nw-crypt"],
            roomSpecialTreasureCollected={"room-nw-crypt": True},
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0, "inventory": []}],
            treasureDeck=[
                {
                    "id": "potion-healing-test",
                    "type": "potion",
                    "title": "Potion of Healing",
                    "item": "healing_potion",
                    "gold": 0,
                    "icon": "🧪",
                    "description": "A restorative elixir sealed in crystal.",
                    "flavor": "Brewed by the Emperor's court alchemists."
                }
            ],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Barbarian searches the room interactively for treasure")
        res = self.ai.search(interactive=True)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("waitingForClick"))

        st_overlay = self.ai.get_state()
        overlay = st_overlay.get("treasureOverlay", {})
        bdd_step("THEN", "Vertical parchment card overlay is active",
                 assertions=[
                     f"Overlay active: {overlay.get('active')}",
                     f"Card title: {overlay.get('title')}",
                     f"Card type: {overlay.get('cardType')}"
                 ])
        self.assertTrue(overlay.get("active"))
        self.assertEqual(overlay.get("title"), "Potion of Healing")
        self.assertEqual(overlay.get("cardType"), "potion")

        # Flashing item shouldn't be active yet while card overlay is open
        flash_before = self.ai.get_flash_item()
        self.assertFalse(flash_before.get("active", False))

        bdd_step("WHEN", "Hero clicks to collect / dismiss the treasure card")
        resolve_res = self.ai.resolve_treasure_overlay()
        self.assertTrue(resolve_res.get("success"))

        st_after = self.ai.get_state()
        flash = st_after.get("flashItem", {})
        bdd_step("THEN", "New item flashes immediately because hero is out of movement",
                 assertions=[
                     f"Flash active: {flash.get('active')}",
                     f"Flash name: {flash.get('name')}",
                     f"Flash type: {flash.get('type')}",
                     f"Flash hero: {flash.get('heroName')}",
                     f"Flash message: {flash.get('message')}"
                 ])
        self.assertTrue(flash.get("active"))
        self.assertEqual(flash.get("name"), "Potion of Healing")
        self.assertEqual(flash.get("type"), "item")
        self.assertIn("Potion of Healing", flash.get("message", ""))

        # Verify hero inventory has the item
        active_h = st_after.get("heroes", [{}])[0]
        self.assertIn("healing_potion", active_h.get("inventory", []))

    def test_02_pending_item_queued_and_flashed_when_movement_exhausted(self):
        """When hero searches BEFORE moving, reward is queued in pendingFlashItem,
        and flashes the exact moment movement drops to 0!"""
        print("\n=====================================================================================")
        print("🎲 TEST 02: Pending Item Queued and Flashed Exactly When Movement Reaches 0")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian inside crypt at (4, 3) with 2 movement squares remaining")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            movedBeforeAction=False,
            movementRolled=True,
            movementRemaining=2,
            movementClosed=False,
            turnState="moving",
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            treasureDeck=[
                {
                    "id": "gold-50-test",
                    "type": "gold",
                    "title": "Gold! (50 Gold Coins)",
                    "gold": 50,
                    "icon": "💰",
                    "description": "Hidden beneath stone flagstones, you uncover 50 Gold Coins.",
                    "flavor": "A glittering reward tucked away from prying eyes."
                }
            ],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Hero searches chamber while still having 2 movement squares remaining")
        self.ai.search(interactive=True)
        self.ai.resolve_treasure_overlay()

        st_after_search = self.ai.get_state()
        flash = st_after_search.get("flashItem", {})
        pending = st_after_search.get("pendingFlashItem", {})

        bdd_step("THEN", "Item is held in pendingFlashItem and NOT yet flashing (hero has movement left)",
                 assertions=[
                     f"Flash active: {flash.get('active', False)}",
                     f"Pending active: {pending.get('active')}",
                     f"Pending name: {pending.get('name')}",
                     f"Pending amount: {pending.get('amount')}"
                 ])
        self.assertFalse(flash.get("active", False))
        self.assertTrue(pending.get("active"))
        self.assertEqual(pending.get("amount"), 50)

        bdd_step("WHEN", "Hero moves 1 square from (4, 3) to (4, 4), leaving 1 movement remaining")
        m1 = self.ai.move_hero([4, 4])
        self.assertTrue(m1.get("success"))

        st_mid_move = self.ai.get_state()
        self.assertEqual(st_mid_move.get("movementRemaining"), 1)
        self.assertFalse(st_mid_move.get("flashItem", {}).get("active", False))
        self.assertTrue(st_mid_move.get("pendingFlashItem", {}).get("active", False))
        bdd_step("THEN", "Still not flashing because 1 movement remains")

        bdd_step("WHEN", "Hero moves final square to (3, 4), exhausting all movement (0 remaining)")
        m2 = self.ai.move_hero([3, 4])
        self.assertTrue(m2.get("success"))

        st_final = self.ai.get_state()
        final_flash = st_final.get("flashItem", {})
        final_pending = st_final.get("pendingFlashItem", {})

        bdd_step("THEN", "New treasure flashes immediately upon reaching 0 movement!",
                 assertions=[
                     f"Movement remaining: {st_final.get('movementRemaining')}",
                     f"Flash active: {final_flash.get('active')}",
                     f"Flash name: {final_flash.get('name')}",
                     f"Flash amount: {final_flash.get('amount')}",
                     f"Pending active: {final_pending.get('active', False)}"
                 ])
        self.assertEqual(st_final.get("movementRemaining"), 0)
        self.assertTrue(final_flash.get("active"))
        self.assertEqual(final_flash.get("amount"), 50)
        self.assertFalse(final_pending.get("active", False))

    def test_03_pending_item_flashed_on_end_turn(self):
        """If hero has a pending treasure item and ends their turn before spending movement,
        it triggers the flash upon ending turn."""
        print("\n=====================================================================================")
        print("🎲 TEST 03: Pending Treasure Flashed When Ending Turn Early")
        print("=====================================================================================")

        bdd_step("GIVEN", "Barbarian with pending treasure item (+25 Gold Coins)")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=True,
            movementRemaining=3,
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 25}],
            pendingFlashItem={
                "name": "25 Gold Coins",
                "type": "gold",
                "amount": 25,
                "hero_id": "barbarian",
                "hero_name": "Barbarian"
            }
        )

        st = self.ai.get_state()
        self.assertTrue(st.get("pendingFlashItem", {}).get("active"))
        self.assertFalse(st.get("flashItem", {}).get("active", False))

        bdd_step("WHEN", "Hero ends turn without spending remaining 3 movement")
        self.ai.end_turn()

        st_after = self.ai.get_state()
        flash = st_after.get("flashItem", {})
        bdd_step("THEN", "Pending treasure was flashed and pending state cleared",
                 assertions=[
                     f"Flash active: {flash.get('active')}",
                     f"Flash name: {flash.get('name')}",
                     f"Pending active: {st_after.get('pendingFlashItem', {}).get('active', False)}"
                 ])
        self.assertTrue(flash.get("active"))
        self.assertEqual(flash.get("name"), "25 Gold Coins")
        self.assertFalse(st_after.get("pendingFlashItem", {}).get("active", False))

    def test_04_capture_vertical_parchment_treasure_card_screenshot(self):
        """Capture screenshot of the authentic vertical parchment treasure card modal for visual verification."""
        print("\n=====================================================================================")
        print("🎲 TEST 04: Capture Visual Screenshot of Authentic Vertical Parchment Treasure Card")
        print("=====================================================================================")

        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            roomSpecialTreasureCollected={"room-nw-crypt": True},
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            treasureDeck=[
                {
                    "id": "potion-healing-photo",
                    "type": "potion",
                    "title": "Potion of Healing",
                    "item": "healing_potion",
                    "gold": 0,
                    "icon": "🧪",
                    "description": "In a bundle of rags, you find a small bottle of bluish liquid. You can drink this healing potion at any time, restoring up to 4 Body Points.",
                    "flavor": "Do not return this card to the deck."
                }
            ],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )
        self.ai.search(interactive=True)
        time.sleep(0.3)

        out_path = "/tmp/tabletop_vertical_parchment_treasure_card.png"
        res = self.ai.execute_action("take_screenshot", path=out_path)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(out_path))

        bdd_step("THEN", f"Screenshot saved to {out_path} ({os.path.getsize(out_path)} bytes)")
        self.ai.resolve_treasure_overlay()


if __name__ == "__main__":
    unittest.main()
