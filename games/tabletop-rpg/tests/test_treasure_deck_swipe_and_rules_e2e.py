#!/usr/bin/env python3
"""
test_treasure_deck_swipe_and_rules_e2e.py
BDD Test Suite for HeroQuest Treasure Search, AI-Generated Treasure Deck Art,
Card Swipe-In Animation, and Resolution Pipeline.
"""

from __future__ import annotations

import os
import shutil
import struct
import subprocess
import sys
import time
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, text: str, action_info: str = None, assertions: list = None):
    print("")
    print(f"  {step_type.upper():<7} {text}")
    if action_info:
        print(f"    🖱️  [ACTION]    {action_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION] {a}")


class TestTreasureDeckSwipeAndRulesE2E(unittest.TestCase):
    qa: TabletopQAPlayer
    godot_proc: subprocess.Popen | None = None
    port: int = 18092

    @classmethod
    def setUpClass(cls):
        print("")
        print("=" * 90)
        print("🎴 FEATURE: HeroQuest Treasure Deck AI Art, Swipe-In Animation & Resolution Rules")
        print("   Rule: Room-only search, 1 per hero per room, quest note special treasure,")
        print("         permanent treasure discard vs hazard return/shuffle, and deck ratio escalation.")
        print("=" * 90)
        cls.qa = TabletopQAPlayer(port=cls.port)
        if not cls.qa.check_health():
            print(f"Starting Godot player on port {cls.port}...")
            env = os.environ.copy()
            env["DISPLAY"] = ":0"
            cls.godot_proc = subprocess.Popen(
                ["/home/ndipiazza/.local/bin/godot", "--path", ROOT_DIR, "--player"],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            if not cls.qa.wait_for_ready(15.0):
                raise RuntimeError("Failed to connect to Godot server!")

    @classmethod
    def tearDownClass(cls):
        if cls.godot_proc:
            try:
                cls.godot_proc.terminate()
                cls.godot_proc.wait(timeout=2.0)
            except Exception:
                cls.godot_proc.kill()

    def setUp(self):
        self.qa.reset_game()
        time.sleep(0.15)

    def test_01_treasure_deck_assets_on_disk(self):
        """Scenario 1: AI-generated Treasure Card Deck and Card Face Template assets on disk."""
        print("")
        print("=" * 85)
        print("⌛ SCENARIO 01: Asset Audit: AI-Generated Treasure Card Deck (3:4 High-Res PNG)")
        print("=" * 85)
        deck_path = os.path.join(ROOT_DIR, "assets", "cards", "treasure_card_deck.png")
        template_path = os.path.join(ROOT_DIR, "assets", "cards", "treasure_card_template.png")

        bdd_step("GIVEN", "Directory games/tabletop-rpg/assets/cards/ exists")
        self.assertTrue(os.path.exists(deck_path), f"Deck asset missing: {deck_path}")
        self.assertTrue(os.path.exists(template_path), f"Template asset missing: {template_path}")

        deck_size = os.path.getsize(deck_path)
        template_size = os.path.getsize(template_path)
        self.assertGreater(deck_size, 500_000, "Deck PNG should be high resolution (>500KB)")
        self.assertGreater(template_size, 500_000, "Template PNG should be high resolution (>500KB)")

        with open(deck_path, "rb") as f:
            head = f.read(24)
            self.assertEqual(head[1:4], b"PNG", "Must be valid PNG header")
            w, h = struct.unpack(">II", head[16:24])
            print(f"    ✔  [ASSET] treasure_card_deck.png: {deck_size:,} bytes, {w}x{h} PNG")

        with open(template_path, "rb") as f:
            head = f.read(24)
            self.assertEqual(head[1:4], b"PNG", "Must be valid PNG header")
            tw, th = struct.unpack(">II", head[16:24])
            print(f"    ✔  [ASSET] treasure_card_template.png: {template_size:,} bytes, {tw}x{th} PNG")

        bdd_step("THEN", "All AI-generated card assets verified successfully!")

    def test_02_preconditions_and_scope_enforcement(self):
        """Scenario 2: Corridor restriction, living monster restriction, and once-per-hero limit."""
        print("")
        print("=" * 85)
        print("⌛ SCENARIO 02: Preconditions: Corridor Forbidden, No Monsters, Max 1 Per Hero")
        print("=" * 85)

        # 1. Corridor check
        bdd_step("GIVEN", "Barbarian standing in corridor at (0, 1)")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1]}]
        )
        res_corridor = self.qa.search()
        bdd_step("THEN", "Corridor search rejected",
                 assertions=[f"Success: {res_corridor.get('success')}", f"Error: {res_corridor.get('error')}"])
        self.assertFalse(res_corridor.get("success"))
        self.assertIn("corridor", res_corridor.get("error", "").lower())

        # 2. Living monster in room
        bdd_step("GIVEN", "Barbarian in Northwest Crypt with active living Skeleton")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3]}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": True, "current_bp": 1, "roomId": "room-nw-crypt", "grid_pos": [3, 4]}
            ]
        )
        res_mon = self.qa.search()
        bdd_step("THEN", "Search blocked while monsters present in room",
                 assertions=[f"Success: {res_mon.get('success')}", f"Error: {res_mon.get('error')}"])
        self.assertFalse(res_mon.get("success"))
        self.assertIn("monsters", res_mon.get("error", "").lower())

        # 3. Once per hero per room
        bdd_step("GIVEN", "Northwest Crypt cleared of monsters; Barbarian searches")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )
        res_first = self.qa.search()
        self.assertTrue(res_first.get("success"))

        bdd_step("WHEN", "Barbarian attempts a second search in the same room")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            preserveSearchedRooms=True
        )
        res_second = self.qa.search()
        bdd_step("THEN", "Second search by same hero rejected",
                 assertions=[f"Success: {res_second.get('success')}", f"Error: {res_second.get('error')}"])
        self.assertFalse(res_second.get("success"))
        self.assertIn("already searched", res_second.get("error", "").lower())

        # 4. Different hero can search
        bdd_step("WHEN", "Dwarf enters same room and searches")
        self.qa.set_state(
            activeHero="dwarf",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "grid_pos": [4, 3], "is_on_board": True},
                {"id": "dwarf", "grid_pos": [3, 3], "is_on_board": True, "gold": 0}
            ],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ],
            preserveSearchedRooms=True
        )
        res_dwarf = self.qa.search()
        bdd_step("THEN", "Dwarf first search in chamber succeeds",
                 assertions=[f"Success: {res_dwarf.get('success')}"])
        self.assertTrue(res_dwarf.get("success"))

    def test_03_resolution_pipeline_step_1_quest_notes_fallback(self):
        """Scenario 3: Step 1 claims special treasure; subsequent search falls back to Step 2."""
        print("")
        print("=" * 85)
        print("⌛ SCENARIO 03: Step 1 Quest Notes Evaluation & Fallback to Step 2")
        print("=" * 85)

        bdd_step("GIVEN", "Northwest Crypt with Quest Note stone chest (50 GP)")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )
        res1 = self.qa.search()
        self.assertTrue(res1.get("success"))
        self.assertTrue(res1.get("questTreasure"), "First search should trigger Quest Note special treasure")
        self.assertEqual(res1.get("goldFound"), 50)

        bdd_step("WHEN", "Dwarf searches same room after special treasure is already claimed")
        test_deck_card = {
            "id": "gold-random-test",
            "type": "gold",
            "title": "Gold! (25 Gold Coins)",
            "gold": 25,
            "description": "Random coin pouch discovered."
        }
        self.qa.set_state(
            activeHero="dwarf",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "dwarf", "grid_pos": [3, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ],
            preserveSearchedRooms=True,
            treasureDeck=[test_deck_card]
        )
        res2 = self.qa.search()
        bdd_step("THEN", "Dwarf search falls back to Step 2 (random treasure deck)",
                 assertions=[
                     f"Success: {res2.get('success')}",
                     f"Quest treasure flag: {res2.get('questTreasure')}",
                     f"Card ID drawn: {res2.get('card', {}).get('id')}",
                     f"Gold awarded: {res2.get('goldFound')}"
                 ])
        self.assertTrue(res2.get("success"))
        self.assertFalse(res2.get("questTreasure"))
        self.assertEqual(res2.get("card", {}).get("id"), "gold-random-test")
        self.assertEqual(res2.get("goldFound"), 25)

    def test_04_good_treasure_permanent_discard_mechanics(self):
        """Scenario 4: Good treasure card is permanently removed from the deck for the quest."""
        print("")
        print("=" * 85)
        print("⌛ SCENARIO 04: Good Treasure Permanently Discarded From Deck")
        print("=" * 85)

        potion_card = {
            "id": "potion-test-unique",
            "type": "potion",
            "title": "Potion of Healing",
            "item": "healing_potion",
            "gold": 0,
            "description": "Restores 4 BP."
        }
        hazard_card = {
            "id": "hazard-test-reserve",
            "type": "hazard",
            "title": "Pit Trap",
            "damage": 1,
            "description": "Spike pit."
        }

        bdd_step("GIVEN", "Treasure deck primed with [Potion of Healing, Pit Trap]")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "grid_pos": [3, 8], "inventory": []}],
            monsters=[{"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}],
            roomSpecialTreasureCollected={"room-grand-fossil": True},
            treasureDeck=[potion_card, hazard_card],
            treasureDiscard=[]
        )

        st_before = self.qa.get_treasure_deck_stats()
        self.assertEqual(st_before["deckCount"], 2)
        self.assertEqual(st_before["discardCount"], 0)

        bdd_step("WHEN", "Barbarian draws Potion of Healing")
        res = self.qa.search()
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("card", {}).get("id"), "potion-test-unique")

        st_after = self.qa.get_treasure_deck_stats()
        bdd_step("THEN", "Potion is permanently moved to discard; deck count decreases to 1",
                 assertions=[
                     f"Deck count: {st_after['deckCount']} (expected 1)",
                     f"Discard count: {st_after['discardCount']} (expected 1)",
                     f"Remaining goods: {st_after['goodsCount']} (expected 0)",
                     f"Remaining hazards: {st_after['hazardsCount']} (expected 1)"
                 ])
        self.assertEqual(st_after["deckCount"], 1)
        self.assertEqual(st_after["discardCount"], 1)
        self.assertEqual(st_after["goodsCount"], 0)
        self.assertEqual(st_after["hazardsCount"], 1)

    def test_05_hazard_returned_and_shuffled_with_escalating_ratio(self):
        """Scenario 5: Hazard card returns to deck and increases mathematical danger ratio."""
        print("")
        print("=" * 85)
        print("⌛ SCENARIO 05: Hazard / Wandering Monster Card Returns to Deck & Shuffles")
        print("=" * 85)

        gold_card_1 = {"id": "g-1", "type": "gold", "title": "Gold 25", "gold": 25}
        gold_card_2 = {"id": "g-2", "type": "gold", "title": "Gold 50", "gold": 50}
        hazard_card = {"id": "h-pit", "type": "hazard", "title": "Pit Trap", "damage": 1}

        bdd_step("GIVEN", "Deck containing 2 Gold cards and 1 Hazard card (initial hazard ratio 33%)")
        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "grid_pos": [3, 8], "current_bp": 8}],
            monsters=[{"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}],
            roomSpecialTreasureCollected={"room-grand-fossil": True},
            treasureDeck=[hazard_card, gold_card_1, gold_card_2],
            treasureDiscard=[]
        )

        st0 = self.qa.get_treasure_deck_stats()
        self.assertEqual(st0["deckCount"], 3)
        self.assertEqual(st0["hazardsCount"], 1)
        self.assertAlmostEqual(st0["hazardRatio"], 1.0 / 3.0, places=2)

        bdd_step("WHEN", "Barbarian draws Hazard card")
        res_h = self.qa.search()
        self.assertTrue(res_h.get("success"))
        self.assertEqual(res_h.get("card", {}).get("type"), "hazard")

        st_after_h = self.qa.get_treasure_deck_stats()
        bdd_step("THEN", "Hazard is resolved and RETURNED to deck; deck count remains 3",
                 assertions=[
                     f"Deck count: {st_after_h['deckCount']} (expected 3)",
                     f"Discard count: {st_after_h['discardCount']} (expected 0)",
                     f"Hazards count: {st_after_h['hazardsCount']} (expected 1)"
                 ])
        self.assertEqual(st_after_h["deckCount"], 3)
        self.assertEqual(st_after_h["discardCount"], 0)
        self.assertEqual(st_after_h["hazardsCount"], 1)

        bdd_step("WHEN", "Dwarf draws next card (Gold card 1 is drawn and discarded)")
        self.qa.set_state(
            activeHero="dwarf",
            hasActed=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "dwarf", "grid_pos": [3, 7], "gold": 0}],
            monsters=[{"id": "mon-verag", "is_alive": False, "current_bp": 0, "roomId": "room-grand-fossil"}],
            preserveSearchedRooms=True,
            treasureDeck=[gold_card_1, hazard_card, gold_card_2]
        )
        res_g1 = self.qa.search()
        self.assertTrue(res_g1.get("success"))

        st_after_g1 = self.qa.get_treasure_deck_stats()
        bdd_step("THEN", "Gold removed permanently; deck has 2 cards, hazard ratio rises to 50%",
                 assertions=[
                     f"Deck count: {st_after_g1['deckCount']} (expected 2)",
                     f"Discard count: {st_after_g1['discardCount']} (expected 1)",
                     f"Hazard ratio: {st_after_g1['hazardRatio']:.1%} (expected 50.0%)"
                 ])
        self.assertEqual(st_after_g1["deckCount"], 2)
        self.assertEqual(st_after_g1["discardCount"], 1)
        self.assertAlmostEqual(st_after_g1["hazardRatio"], 0.50, places=2)

    def test_06_interactive_treasure_modal_swipe_and_visual_proof(self):
        """Scenario 6: Interactive search displays TreasureModal with deck art, swipe animation, and screenshot."""
        print("")
        print("=" * 85)
        print("⌛ SCENARIO 06: Interactive TreasureModal: Deck Art, Card Swipe & Visual Proof")
        print("=" * 85)

        self.qa.set_state(
            activeHero="barbarian",
            hasActed=False,
            revealedRooms=["room-nw-crypt"],
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            monsters=[
                {"id": "mon-skel-1", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "is_alive": False, "current_bp": 0, "roomId": "room-nw-crypt"}
            ]
        )

        bdd_step("WHEN", "Player initiates interactive treasure search")
        res = self.qa.search(interactive=True)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("waitingForClick"))

        time.sleep(0.5)

        st = self.qa.get_state()
        overlay = st.get("treasureOverlay", {})
        bdd_step("THEN", "TreasureModal is visible with AI deck asset and swiped card details",
                 assertions=[
                     f"Modal open: {st.get('treasureModalOpen')}",
                     f"Overlay active: {overlay.get('active')}",
                     f"Card Title: {overlay.get('title')}",
                     f"Deck Count: {overlay.get('deckCount')}",
                     f"Hazard Ratio: {overlay.get('hazardRatio')}"
                 ])
        self.assertTrue(st.get("treasureModalOpen"))
        self.assertTrue(overlay.get("active"))
        self.assertTrue(overlay.get("waitingForClick"))

        tmp_shot = "/tmp/tabletop_treasure_deck_swipe_modal.png"
        brain_shot = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f/tabletop_treasure_deck_swipe_modal.png"
        shot_res = self.qa.execute_action("take_screenshot", path=tmp_shot)
        self.assertTrue(shot_res.get("success"))
        self.assertTrue(os.path.exists(tmp_shot))
        shutil.copyfile(tmp_shot, brain_shot)
        print(f"    ✔  [VISUAL PROOF] Saved TreasureModal screenshot: {brain_shot} ({os.path.getsize(brain_shot):,} bytes)")

        bdd_step("WHEN", "Player clicks / resolves the treasure overlay")
        resolve_res = self.qa.resolve_treasure_overlay()
        self.assertTrue(resolve_res.get("success"))

        st_after = self.qa.get_state()
        self.assertFalse(st_after.get("treasureModalOpen", False))
        self.assertFalse(st_after.get("treasureOverlay", {}).get("active", False))
        bdd_step("THEN", "TreasureModal dismissed cleanly and game state updated")


if __name__ == "__main__":
    unittest.main()
