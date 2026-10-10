#!/usr/bin/env python3
"""
E2E Test Suite for The Trial Dread Spells and Tabletop AI Decision & Targeting Logs.

Validates:
1. Quest 1: The Trial boss monster (Verag the Orc Warlord) has expanded dread spells:
   ['lightning-bolt', 'firestorm', 'fear', 'sleep-dread', 'cloud-of-chaos'].
2. Tabletop AI engine prints useful messages in command logs explaining the decision
   to cast a spell or not (range with line of sight vs adjacent melee evaluation vs grimoire exhaustion).
3. Tabletop AI engine prints useful messages in command logs explaining what hero to pick
   based on difficulty setting (Hard Mode: lethal finisher / caster suppression / weakest defense;
   Normal Mode: balanced threat & proximity; Easy Mode: frontline tank).
4. Direct execution of new authentic HeroQuest dread spells (Firestorm, Sleep of Dread, Cloud of Chaos).
"""

import sys
import unittest
import os

import time
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, os.path.join(ROOT_DIR, "rpc_ai"))
from tabletop_qa_player import TabletopQAPlayer


def bdd_step(step_type: str, message: str):
    print(f"\n  {step_type:<7} {message}")


class TestTrialDreadSpellsAndAIDecisionLogsE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18118

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 85)
        print("⚔️ THE TRIAL DREAD SPELLS & TABLETOP AI DECISION LOGS E2E TEST SUITE")
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
            raise RuntimeError(f"Could not connect to Godot tabletop server on port {cls.port}")
        print("Connected to Tabletop Godot server successfully.")

    @classmethod
    def tearDownClass(cls):
        if cls.player:
            try:
                cls.player.execute_action("delete_save_game")
                cls.player.execute_action("reset_game")
            except Exception:
                pass
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        print("\n" + "=" * 85)
        print("⚔️ THE TRIAL DREAD SPELLS & AI DECISION LOGS SUITE COMPLETED")
        print("=" * 85)

    def setUp(self):
        try:
            self.player.execute_action("delete_save_game")
        except Exception:
            pass
        self.player.reset_game()

    def test_01_the_trial_cartridge_boss_has_expanded_dread_spells(self):
        print("\n--- TEST 01: Verag the Orc Warlord Has Expanded Dread Spells in The Trial ---")
        bdd_step("GIVEN", "Pristine Quest 1: The Trial cartridge is loaded")
        st = self.player.get_state()
        self.assertEqual(st.get("activeQuestSlug"), "heroquest-the-trial")

        bdd_step("WHEN", "Inspecting Verag the Orc Warlord in the monsters collection")
        monsters = st.get("monsters", [])
        verag = next((m for m in monsters if "verag" in str(m.get("id", "")).lower() or "verag" in str(m.get("name", "")).lower()), None)
        self.assertIsNotNone(verag, "Verag the Orc Warlord must exist in The Trial quest")

        bdd_step("THEN", "Verag possesses dread spells: lightning-bolt, firestorm, fear, sleep-dread, cloud-of-chaos")
        spells = verag.get("spells", [])
        print(f"       • Verag Dread Spells: {spells}")
        for expected in ["lightning-bolt", "firestorm", "fear", "sleep-dread", "cloud-of-chaos"]:
            self.assertIn(expected, spells, f"Verag must possess dread spell: {expected}")
        self.assertTrue(verag.get("isSpellcaster", False), "Verag must be registered as a spellcaster")
        self.assertTrue(verag.get("isBoss", False), "Verag must be registered as a boss")

    def test_02_ai_decision_to_cast_spell_at_range_with_los(self):
        print("\n--- TEST 02: AI Decision to Cast Dread Spell at Range with Line of Sight ---")
        bdd_step("GIVEN", "Verag at [4, 2] and Wizard at [4, 6] (4 tiles away, clear line of sight)")
        self.player.set_state(
            current_phase="gm_phase",
            heroes=[
                {"id": "wizard", "name": "Telor the Wizard", "grid_pos": [4, 6], "current_bp": 4, "is_on_board": True, "class": "wizard"},
                {"id": "barbarian", "is_on_board": False, "current_bp": 0},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 2],
                    "movementSquares": 1, # Not enough to reach hero
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "isSpellcaster": True,
                    "spells": ["firestorm", "lightning-bolt", "fear"],
                    "used_spells": [],
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Verag executes single monster AI turn")
        res = self.player.execute_monster_action("mon-verag")
        self.assertTrue(res.get("success"), "Monster action should succeed")

        bdd_step("THEN", "Command log explicitly announces AI decision to cast a dread spell across range")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        decision_log = next((l for l in reversed(logs) if "[AI SPELL DECISION]" in l and ("CAST" in l or "range" in l)), None)
        self.assertIsNotNone(
            decision_log,
            f"Expected '[AI SPELL DECISION] ... at range ... Decides to CAST ...' in logs. Got: {logs[-8:]}"
        )
        print(f"       ✔ Verified AI Spell Decision Log: '{decision_log}'")

    def test_03_ai_targeting_based_on_difficulty_hard_mode(self):
        print("\n--- TEST 03: AI Targeting Based on Difficulty: Hard Mode (Lethal Finisher & Caster) ---")
        bdd_step("GIVEN", "Difficulty set to 'hard'")
        res_diff = self.player.set_difficulty("hard")
        self.assertTrue(res_diff.get("success"))
        self.assertEqual(res_diff.get("difficulty_mode"), "hard")

        bdd_step("GIVEN", "Healthy Barbarian (8 BP) and critically wounded Wizard (1 BP) both visible")
        self.player.set_state(
            current_phase="gm_phase",
            difficulty_mode="hard",
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [4, 5], "current_bp": 8, "is_on_board": True, "attackDice": 3, "class": "barbarian"},
                {"id": "wizard", "name": "Telor", "grid_pos": [5, 4], "current_bp": 1, "is_on_board": True, "attackDice": 1, "class": "wizard"},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 4], # Adjacent to both
                    "movementSquares": 0,
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "isSpellcaster": True,
                    "spells": ["lightning-bolt", "firestorm"],
                    "used_spells": [],
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Verag acts in Hard Mode")
        res = self.player.execute_monster_action("mon-verag")
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Command logs announce Hard Mode AI targeting Telor (Wizard) for lethal finisher")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        hard_target_log = next((l for l in reversed(logs) if "[AI TARGETING - HARD]" in l or ("[HARD MODE TACTICS]" in l and "Telor" in l)), None)
        self.assertIsNotNone(
            hard_target_log,
            f"Expected Hard Mode targeting log for Telor in logs. Got: {logs[-8:]}"
        )
        print(f"       ✔ Verified Hard Mode Targeting Log: '{hard_target_log}'")

    def test_04_ai_targeting_based_on_difficulty_easy_mode(self):
        print("\n--- TEST 04: AI Targeting Based on Difficulty: Easy Mode (Frontline Tank) ---")
        bdd_step("GIVEN", "Difficulty set to 'easy'")
        res_diff = self.player.set_difficulty("easy")
        self.assertTrue(res_diff.get("success"))
        self.assertEqual(res_diff.get("difficulty_mode"), "easy")

        bdd_step("GIVEN", "Healthy Barbarian (8 BP) and wounded Wizard (2 BP) both visible")
        self.player.set_state(
            current_phase="gm_phase",
            difficulty_mode="easy",
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [4, 5], "current_bp": 8, "is_on_board": True, "class": "barbarian"},
                {"id": "wizard", "name": "Telor", "grid_pos": [5, 4], "current_bp": 2, "is_on_board": True, "class": "wizard"},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 4],
                    "movementSquares": 0,
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "isSpellcaster": True,
                    "spells": [],
                    "used_spells": [],
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Verag acts in Easy Mode")
        res = self.player.execute_monster_action("mon-verag")
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Command logs announce Easy Mode AI targeting Rogar (Barbarian tank) to spare the wounded")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        easy_target_log = next((l for l in reversed(logs) if "[AI TARGETING - EASY]" in l or "Rogar" in l), None)
        self.assertIsNotNone(
            easy_target_log,
            f"Expected Easy Mode targeting log for Rogar in logs. Got: {logs[-8:]}"
        )
        print(f"       ✔ Verified Easy Mode Targeting Log: '{easy_target_log}'")

    def test_05_execution_of_new_dread_spells_sleep_and_cloud_of_chaos(self):
        print("\n--- TEST 05: Execution of New Dread Spells: Sleep of Dread & Cloud of Chaos ---")
        bdd_step("GIVEN", "Verag casting Sleep of Dread on Barbarian")
        self.player.set_state(
            current_phase="gm_phase",
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [4, 5], "current_bp": 8, "is_on_board": True, "is_sleeping": False},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0},
                {"id": "wizard", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 4],
                    "is_alive": True
                }
            ],
            clearMonsters=True
        )

        res_sleep = self.player.dm_cast_spell("mon-verag", "sleep-dread", "barbarian")
        self.assertTrue(res_sleep.get("success"), "Sleep of Dread cast must succeed")

        bdd_step("THEN", "Rogar falls into enchanted slumber (is_sleeping = True)")
        st_after_sleep = self.player.get_state()
        rogar = next((h for h in st_after_sleep.get("heroes", []) if h.get("id") == "barbarian"), {})
        self.assertTrue(rogar.get("is_sleeping", False), "Barbarian must be sleeping after Sleep of Dread")

        bdd_step("WHEN", "Verag casts Cloud of Chaos on Dwarf")
        self.player.set_state(
            heroes=[
                {"id": "dwarf", "name": "Dorgan", "grid_pos": [4, 5], "current_bp": 7, "is_on_board": True, "tempest_stunned": False}
            ]
        )
        res_cloud = self.player.dm_cast_spell("mon-verag", "cloud-of-chaos", "dwarf")
        self.assertTrue(res_cloud.get("success"), "Cloud of Chaos cast must succeed")

        bdd_step("THEN", "Dorgan is stunned (tempest_stunned = True)")
        st_after_cloud = self.player.get_state()
        dorgan = next((h for h in st_after_cloud.get("heroes", []) if h.get("id") == "dwarf"), {})
        self.assertTrue(dorgan.get("tempest_stunned", False), "Dwarf must be stunned after Cloud of Chaos")

    def test_06_grimoire_exhaustion_logs_fallback_to_melee(self):
        print("\n--- TEST 06: Grimoire Exhaustion Logs Fallback to Physical Melee ---")
        bdd_step("GIVEN", "Verag has used all spells in grimoire")
        self.player.set_state(
            current_phase="gm_phase",
            heroes=[
                {"id": "barbarian", "name": "Rogar", "grid_pos": [4, 5], "current_bp": 8, "is_on_board": True}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 4], # Adjacent
                    "movementSquares": 0,
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "isSpellcaster": True,
                    "spells": ["lightning-bolt", "fear"],
                    "used_spells": ["lightning-bolt", "fear"], # All exhausted
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Verag acts with exhausted grimoire")
        res = self.player.execute_monster_action("mon-verag")
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Command log explains that dread spells are exhausted, defaulting to physical attack")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        exhaust_log = next((l for l in reversed(logs) if "[AI SPELL DECISION]" in l and "exhausted" in l), None)
        self.assertIsNotNone(
            exhaust_log,
            f"Expected '[AI SPELL DECISION] ... exhausted all dread spells ...' in logs. Got: {logs[-8:]}"
        )
        print(f"       ✔ Verified Grimoire Exhaustion Log: '{exhaust_log}'")


if __name__ == "__main__":
    unittest.main()
