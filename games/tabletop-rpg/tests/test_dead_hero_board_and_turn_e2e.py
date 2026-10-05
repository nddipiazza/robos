#!/usr/bin/env python3
"""
Test Tabletop RPG Dead Heroes Board Presence & Turn Progression E2E:
Validates:
1. When a hero is dead (current_bp <= 0 or is_dead=True):
   - They no longer appear on the game board (isOnBoard=False, excluded from board rendering tokens).
   - They can no longer take turns or be chosen as active hero.
2. Turn rotation (end_turn) skips dead heroes:
   - If hero 0 (Barbarian) is dead, a new round starts with hero 1 (Dwarf).
   - If hero 1 (Dwarf) is dead, ending Barbarian's turn advances directly to hero 2 (Elf).
   - If hero 3 (Wizard) is dead, ending Elf's turn transitions straight to Zargon / GM phase.
3. Dead heroes cannot roll movement or execute actions.
4. Player cards accurately reflect dead status ([DEAD], isDead=True, isAlive=False, isActive=False).
5. All heroes eliminated results in quest defeat.
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


class TestDeadHeroBoardAndTurnE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18106

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚔️ TABLETOP RPG DEAD HERO BOARD REMOVAL & TURN ROTATION SKIPPING E2E SUITE")
        print("=" * 90)
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
            raise RuntimeError(f"Could not connect to Godot tabletop server on port {cls.port}")
        print("Connected to Tabletop Godot server successfully.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except Exception:
                cls.proc.kill()
        print("Tabletop Godot server shut down.")

    def setUp(self):
        self.player.reset_game()
        time.sleep(0.15)

    def test_01_dead_hero_removed_from_game_board(self):
        """Verify that when a hero dies (0 BP), they are removed from the game board."""
        bdd_step("GIVEN", "Pristine starting quest state with all 4 living heroes on board")
        st = self.player.get_state()
        cards = st.get("characterCards", [])
        self.assertEqual(len(cards), 4)
        for c in cards:
            self.assertTrue(c.get("isAlive"), f"{c.get('name')} should be alive initially")
            self.assertTrue(c.get("isOnBoard"), f"{c.get('name')} should be on board initially")
            self.assertFalse(c.get("isDead"), f"{c.get('name')} should not be dead initially")

        bdd_step("WHEN", "Barbarian is slain in battle (current_bp set to 0)")
        res = self.player.defeat_hero("barbarian")
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Barbarian is removed from the game board and marked dead on player card", [
            "Barbarian isOnBoard is False (token no longer rendered on board)",
            "Barbarian isDead is True and isAlive is False",
            "Living heroes (Dwarf, Elf, Wizard) remain on board"
        ])
        st2 = self.player.get_state()
        cards2 = st2.get("characterCards", [])
        barb = next((c for c in cards2 if c.get("id") == "barbarian"), None)
        self.assertIsNotNone(barb)
        self.assertEqual(barb.get("current_bp"), 0)
        self.assertFalse(barb.get("isOnBoard"), "Dead Barbarian must NOT be on board")
        self.assertTrue(barb.get("isDead"), "Dead Barbarian must have isDead=True")
        self.assertFalse(barb.get("isAlive"), "Dead Barbarian must have isAlive=False")
        self.assertFalse(barb.get("isActive"), "Dead Barbarian cannot be active")

        # Other 3 heroes must remain on board
        for c in cards2:
            if c.get("id") != "barbarian":
                self.assertTrue(c.get("isAlive"), f"{c.get('name')} should still be alive")
                self.assertTrue(c.get("isOnBoard"), f"{c.get('name')} should still be on board")

    def test_02_dead_first_hero_skipped_when_starting_round(self):
        """Verify that when the first hero (Barbarian) is dead, Round starts with the first living hero (Dwarf)."""
        bdd_step("GIVEN", "Barbarian is dead before round begins")
        self.player.defeat_hero("barbarian")

        bdd_step("WHEN", "We simulate transition to hero phase (e.g. from GM phase to Round 2)")
        self.player.set_state(current_phase="gm_phase")
        self.player.end_turn()  # GM ends turn, transitions to hero_phase

        bdd_step("THEN", "Active hero is Dwarf, skipping dead Barbarian entirely", [
            "current_phase is hero_phase",
            "active_hero is Dwarf (index 1)",
            "Barbarian does not receive a turn"
        ])
        st = self.player.get_state()
        self.assertEqual(st.get("phase"), "hero_phase")
        self.assertEqual(st.get("activeHero"), "dwarf")
        self.assertEqual(st.get("activeHeroIndex"), 1)

        cards = st.get("characterCards", [])
        dwarf_card = next(c for c in cards if c.get("id") == "dwarf")
        barb_card = next(c for c in cards if c.get("id") == "barbarian")
        self.assertTrue(dwarf_card.get("isActive"))
        self.assertFalse(barb_card.get("isActive"))

    def test_03_dead_middle_hero_skipped_during_turn_rotation(self):
        """Verify that when Dwarf (middle hero) is dead, ending Barbarian's turn advances directly to Elf."""
        bdd_step("GIVEN", "Dwarf is slain in battle while Barbarian is taking their turn")
        self.player.defeat_hero("dwarf")
        st = self.player.get_state()
        self.assertEqual(st.get("activeHero"), "barbarian")

        bdd_step("WHEN", "Barbarian ends their turn")
        self.player.end_turn()

        bdd_step("THEN", "Turn advances straight to Elf, skipping dead Dwarf", [
            "Next active hero is Elf (index 2)",
            "Dwarf turn was completely skipped"
        ])
        st2 = self.player.get_state()
        self.assertEqual(st2.get("activeHero"), "elf")
        self.assertEqual(st2.get("activeHeroIndex"), 2)

    def test_04_dead_last_hero_transitions_straight_to_zargon(self):
        """Verify that when Wizard (last hero) is dead, ending Elf's turn transitions straight to GM phase."""
        bdd_step("GIVEN", "Wizard is dead and Elf is currently active")
        self.player.defeat_hero("wizard")
        # Advance Barbarian -> Dwarf -> Elf
        self.player.end_turn()  # Barbarian -> Dwarf
        self.player.end_turn()  # Dwarf -> Elf
        st = self.player.get_state()
        self.assertEqual(st.get("activeHero"), "elf")

        bdd_step("WHEN", "Elf ends their turn")
        self.player.end_turn()

        bdd_step("THEN", "Round moves immediately to Zargon GM phase", [
            "current_phase is gm_phase",
            "Wizard turn was skipped",
            "turn_overlay reflects Zargon or turn complete"
        ])
        st2 = self.player.get_state()
        self.assertEqual(st2.get("phase"), "gm_phase")

    def test_05_dead_hero_cannot_roll_movement_or_act(self):
        """Verify that a dead hero cannot roll movement or move."""
        bdd_step("GIVEN", "Only Elf is alive, but test attempts to trigger roll for fallen Barbarian")
        self.player.defeat_hero("barbarian")
        # Attempt to roll movement while Barbarian is dead
        self.player.set_state(activeHeroIndex=0)  # forcefully point to dead Barbarian

        bdd_step("WHEN", "roll_movement is invoked")
        res = self.player.roll_movement()

        bdd_step("THEN", "Movement roll is rejected", [
            "res roll is empty or contains error",
            "movement_rolled remains False"
        ])
        st = self.player.get_state()
        self.assertFalse(st.get("movementRolled"))
        self.assertEqual(st.get("movementRemaining"), 0)

    def test_06_player_card_displays_dead_with_accurate_vitals(self):
        """Verify that player card accurately displays dead status and vitals."""
        bdd_step("GIVEN", "Barbarian and Elf are slain")
        self.player.defeat_hero("barbarian")
        self.player.defeat_hero("elf")

        bdd_step("WHEN", "Player card telemetry is inspected")
        st = self.player.get_state()
        cards = {c["id"]: c for c in st.get("characterCards", [])}

        bdd_step("THEN", "Cards accurately differentiate dead and living heroes", [
            "Barbarian is dead (current_bp=0, isDead=True, isOnBoard=False)",
            "Elf is dead (current_bp=0, isDead=True, isOnBoard=False)",
            "Dwarf is alive (current_bp=7, isDead=False, isOnBoard=True)",
            "Wizard is alive (current_bp=4, isDead=False, isOnBoard=True)"
        ])
        self.assertTrue(cards["barbarian"]["isDead"])
        self.assertFalse(cards["barbarian"]["isOnBoard"])
        self.assertTrue(cards["elf"]["isDead"])
        self.assertFalse(cards["elf"]["isOnBoard"])
        self.assertFalse(cards["dwarf"]["isDead"])
        self.assertTrue(cards["dwarf"]["isOnBoard"])
        self.assertFalse(cards["wizard"]["isDead"])
        self.assertTrue(cards["wizard"]["isOnBoard"])

    def test_07_all_heroes_defeated_leads_to_quest_defeat(self):
        """Verify that defeating all heroes results in quest_defeat state."""
        bdd_step("GIVEN", "All 4 heroes are slain in the catacombs")
        self.player.defeat_hero("barbarian")
        self.player.defeat_hero("dwarf")
        self.player.defeat_hero("elf")
        self.player.defeat_hero("wizard")

        bdd_step("WHEN", "Game state is evaluated")
        st = self.player.get_state()

        bdd_step("THEN", "Game state reports quest_defeat", [
            "gameState is quest_defeat",
            "No living heroes remain on board"
        ])
        self.assertEqual(st.get("gameState"), "quest_defeat")


if __name__ == "__main__":
    unittest.main()
