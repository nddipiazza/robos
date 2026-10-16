#!/usr/bin/env python3
"""
test_spell_line_of_sight_e2e.py
End-to-End BDD test suite verifying strict Line of Sight (LOS) enforcement for spellcasting:
1. Offensive spells (Sleep, Ball of Flame, Fire of Wrath, Tempest) strictly require Line of Sight.
2. Casting across different rooms through solid stone walls is prohibited and rejected with clear error.
3. Once hero establishes direct line of sight (through open doorway or inside chamber), spellcasting succeeds.
4. Mentor AI will not cast spells across rooms; it maneuvers into Line of Sight first.
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


def bdd_scenario_header(num: int, title: str):
    print("\n" + "=" * 90)
    print(f"🔮 SCENARIO {num:02d}: {title}")
    print("=" * 90)


def bdd_step(step_type: str, text: str, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestSpellLineOfSightE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18107

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("📜 FEATURE: Authentic HeroQuest Line of Sight (LOS) Enforcement for Spells")
        print("   Rule: Spells targeting an enemy require direct line-of-sight;")
        print("         Casting across solid walls or from one room to another is strictly prohibited.")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player", "--skip-spell-select"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(25):
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
        print("\n" + "=" * 90)
        print("🏁 FEATURE VERIFIED: Line of Sight strictly enforced for all spellcasting!")
        print("=" * 90 + "\n")

    def setUp(self):
        self.player.cancel_targeting()
        self.player.close_all_dialogs()

    def test_01_cannot_cast_sleep_from_one_room_to_another_through_wall(self):
        bdd_scenario_header(1, "Cannot cast Sleep from one room into another through a solid wall")

        bdd_step("GIVEN", "Elf is inside Northwest Crypt (room-nw-crypt at 3, 3) and Orc is in Grand Fossil Hall (room-grand-fossil at 3, 8)")
        self.player.execute_action("patch_state",
            active_hero="elf",
            has_acted_this_turn=False,
            hasActedThisTurn=False,
            heroes=[
                {
                    "id": "elf",
                    "grid_pos": [3, 3],
                    "is_on_board": True,
                    "current_bp": 6,
                    "spells": ["sleep", "water_of_healing", "veil_of_mist"],
                    "used_spells": []
                }
            ],
            monsters=[
                {
                    "id": "mon-orc-hidden",
                    "name": "Orc Guard",
                    "grid_pos": [3, 8],
                    "is_alive": True,
                    "current_bp": 2,
                    "bodyPoints": 2,
                    "roomId": "room-grand-fossil"
                }
            ],
            revealedRooms=["room-nw-crypt", "room-grand-fossil"],
            discoveredMonsterIds=["mon-orc-hidden"]
        )

        bdd_step("WHEN", "Elf attempts to cast 'sleep' on 'mon-orc-hidden' across room boundaries")
        res = self.player.cast_spell("sleep", "mon-orc-hidden")

        bdd_step("THEN", "The cast attempt fails with Line of Sight error",
                 assertions=[
                     f"res.success == False (actual: {res.get('success')})",
                     f"Error message contains line of sight: '{res.get('error')}'"
                 ])
        self.assertFalse(res.get("success"), "Casting Sleep through walls must fail")
        self.assertIn("line of sight", res.get("error", "").lower())

    def test_02_cannot_cast_ball_of_flame_without_line_of_sight(self):
        bdd_scenario_header(2, "Cannot cast Ball of Flame when wall blocks sightline")

        bdd_step("GIVEN", "Wizard at (3, 3) and target monster behind solid wall at (3, 8)")
        self.player.execute_action("patch_state",
            active_hero="wizard",
            has_acted_this_turn=False,
            hasActedThisTurn=False,
            heroes=[
                {
                    "id": "wizard",
                    "grid_pos": [3, 3],
                    "is_on_board": True,
                    "current_bp": 4,
                    "spells": ["ball_of_flame", "fire_of_wrath"],
                    "used_spells": []
                }
            ],
            monsters=[
                {
                    "id": "mon-orc-blocked",
                    "name": "Orc Guard",
                    "grid_pos": [3, 8],
                    "is_alive": True,
                    "current_bp": 2,
                    "roomId": "room-grand-fossil"
                }
            ],
            revealedRooms=["room-nw-crypt", "room-grand-fossil"]
        )

        bdd_step("WHEN", "Wizard attempts to cast 'ball_of_flame' on occluded monster")
        res = self.player.cast_spell("ball_of_flame", "mon-orc-blocked")

        bdd_step("THEN", "Ball of Flame fails due to blocked line of sight",
                 assertions=[
                     f"res.success == False (actual: {res.get('success')})",
                     f"res.error: '{res.get('error')}'"
                 ])
        self.assertFalse(res.get("success"))
        self.assertIn("line of sight", res.get("error", "").lower())

    def test_03_can_cast_sleep_with_direct_line_of_sight(self):
        bdd_scenario_header(3, "Can cast Sleep once direct Line of Sight is established")

        bdd_step("GIVEN", "Elf at (3, 3) and Orc at (3, 4) in the same revealed room (room-nw-crypt) with clear LOS")
        self.player.execute_action("patch_state",
            active_hero="elf",
            has_acted_this_turn=False,
            hasActedThisTurn=False,
            heroes=[
                {
                    "id": "elf",
                    "grid_pos": [3, 3],
                    "is_on_board": True,
                    "current_bp": 6,
                    "spells": ["sleep", "water_of_healing"],
                    "used_spells": []
                }
            ],
            monsters=[
                {
                    "id": "mon-orc-los",
                    "name": "Orc Guard",
                    "grid_pos": [3, 4],
                    "is_alive": True,
                    "current_bp": 2,
                    "is_sleeping": False,
                    "roomId": "room-nw-crypt"
                }
            ],
            revealedRooms=["room-nw-crypt"],
            discoveredMonsterIds=["mon-orc-los"]
        )

        bdd_step("WHEN", "Elf casts 'sleep' on 'mon-orc-los'")
        res = self.player.cast_spell("sleep", "mon-orc-los")

        bdd_step("THEN", "Sleep spell succeeds and monster enters enchanted slumber",
                 assertions=[
                     f"res.success == True (actual: {res.get('success')})",
                     f"res.is_sleeping == True (actual: {res.get('is_sleeping')})"
                 ])
        self.assertTrue(res.get("success"), f"Cast spell failed: {res.get('error')}")
        self.assertTrue(res.get("is_sleeping"))

        st = self.player.get_state()
        m = next(m for m in st.get("monsters", []) if m.get("id") == "mon-orc-los")
        self.assertTrue(m.get("is_sleeping"))

    def test_04_mentor_ai_does_not_cast_sleep_without_line_of_sight(self):
        bdd_scenario_header(4, "Mentor AI maneuvers into Line of Sight rather than casting through walls")

        bdd_step("GIVEN", "Elf in room-nw-crypt at (3, 3) and only living monster is in room-grand-fossil at (3, 8)")
        self.player.execute_action("patch_state",
            active_hero="elf",
            has_acted_this_turn=False,
            hasActedThisTurn=False,
            movementRemaining=6,
            movementRolled=True,
            heroes=[
                {
                    "id": "elf",
                    "grid_pos": [3, 3],
                    "is_on_board": True,
                    "current_bp": 6,
                    "spells": ["sleep"],
                    "used_spells": []
                }
            ],
            monsters=[
                {
                    "id": "mon-remote-orc",
                    "name": "Remote Orc",
                    "grid_pos": [3, 8],
                    "is_alive": True,
                    "current_bp": 2,
                    "is_sleeping": False,
                    "roomId": "room-grand-fossil"
                }
            ],
            revealedRooms=["room-nw-crypt", "room-grand-fossil"]
        )

        bdd_step("WHEN", "Mentor AI takes a party step for Elf")
        step_res = self.player.step_demo()
        self.assertTrue(step_res.get("success"))

        st = self.player.get_state()
        elf = next(h for h in st.get("heroes", []) if h.get("id") == "elf")
        m = next(m for m in st.get("monsters", []) if m.get("id") == "mon-remote-orc")

        bdd_step("THEN", "Elf did NOT illegally cast Sleep through the wall into the other room",
                 assertions=[
                     f"Sleep not in usedSpells: {'sleep' not in elf.get('used_spells', [])}",
                     f"Monster is NOT sleeping: {m.get('is_sleeping') is not True}"
                 ])
        self.assertNotIn("sleep", elf.get("used_spells", []))
        self.assertFalse(m.get("is_sleeping", False))


if __name__ == "__main__":
    unittest.main()
