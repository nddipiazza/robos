#!/usr/bin/env python3
"""
Test Tabletop RPG AI Tactics & Hard Mode E2E Suite:
Validates:
1. Tactics combat log message printed when a monster cannot reach any hero to attack this turn.
2. Boss tactics combat log message printed when a boss decides to use a spell or a physical attack.
3. Hard mode (`difficulty_mode = 'hard'`) actively prioritizes the weakest target (e.g. Wizard or lowest BP)
   to maximize damage and secure lethal kills.
4. Hard mode telemetry and RPC configuration (`set_difficulty`, `set_hard_mode`, `difficultyMode`, `isHardMode`).
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


class TestAiTacticsAndHardModeE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18105

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 85)
        print("⚔️ TABLETOP RPG AI TACTICS, BOSS SPELL DECISIONS & HARD MODE E2E SUITE")
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
        print("⚔️ AI TACTICS & HARD MODE SUITE COMPLETED")
        print("=" * 85)

    def setUp(self):
        self.player.execute_action("reset_game")
        time.sleep(0.2)

    def test_01_monster_unable_to_reach_heroes_logs_tactics_message(self):
        print("\n--- TEST 01: Monster Unable to Reach Heroes Tactics Log ---")
        bdd_step("GIVEN", "Party of heroes is positioned at dungeon entrance [3, 2]")
        self.player.set_state(
            current_phase="gm_phase",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [3, 2], "current_bp": 8, "is_on_board": True}
            ],
            monsters=[
                {
                    "id": "mon-skel-remote",
                    "slug": "skeleton",
                    "name": "Crypt Skeleton",
                    "grid_pos": [22, 16],
                    "movementSquares": 4,
                    "attackDice": 2,
                    "defendDice": 2,
                    "current_bp": 1,
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Crypt Skeleton acts but cannot reach any hero this turn (rolled movement)")
        res = self.player.execute_monster_action("mon-skel-remote")
        self.assertTrue(res.get("success"), "Monster action must succeed")

        bdd_step("THEN", "Combat log explicitly announces that monster could not reach the heroes to attack")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        tactics_msg = next((l for l in reversed(logs) if "[TACTICS]" in l and "could not reach" in l), None)
        self.assertIsNotNone(
            tactics_msg,
            f"Expected '[TACTICS] ... could not reach the heroes in order to attack this turn.' in logs. Got: {logs[-5:]}"
        )
        print(f"    ✔ Found Tactics Log: '{tactics_msg}'")

    def test_02_boss_decides_spell_vs_attack_tactics_log(self):
        print("\n--- TEST 02: Boss Decides to Use Spell vs Attack Tactics Log ---")
        bdd_step("GIVEN", "Boss Verag the Orc Warlord with spells ['lightning-bolt', 'fear']")

        # Subtest A: Boss decides to cast a spell
        bdd_step("WHEN", "Boss Verag decides to use a spell against hero Wizard")
        self.player.set_state(
            current_phase="gm_phase",
            heroes=[
                {"id": "wizard", "name": "Wizard", "grid_pos": [4, 6], "current_bp": 4, "is_on_board": True},
                {"id": "barbarian", "is_on_board": False, "current_bp": 0},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 2], # 4 tiles away with line of sight (out of melee reach)
                    "movementSquares": 2,
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "isSpellcaster": True,
                    "spells": ["lightning-bolt", "fear"],
                    "used_spells": [],
                    "forced_next_action": "spell",
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        res_spell = self.player.execute_monster_action("mon-verag")
        self.assertTrue(res_spell.get("success"), "Boss monster action should succeed")

        bdd_step("THEN", "Combat log announces: '[BOSS TACTICS] Verag ... decides to use a spell: casting Lightning Bolt'")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        boss_spell_log = next((l for l in reversed(logs) if "[BOSS TACTICS]" in l and "decides to use a spell" in l), None)
        self.assertIsNotNone(
            boss_spell_log,
            f"Expected '[BOSS TACTICS] ... decides to use a spell' in logs. Got: {logs[-6:]}"
        )
        print(f"    ✔ Found Boss Spell Tactics Log: '{boss_spell_log}'")

        # Subtest B: Boss decides to use a physical attack
        bdd_step("WHEN", "Boss Verag is adjacent to Barbarian and decides to use a physical attack")
        self.player.set_state(
            current_phase="gm_phase",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 3], "current_bp": 8, "is_on_board": True},
                {"id": "wizard", "is_on_board": False, "current_bp": 0},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-verag",
                    "slug": "verag-boss",
                    "name": "Verag the Orc Warlord",
                    "grid_pos": [4, 2], # adjacent
                    "movementSquares": 0,
                    "attackDice": 4,
                    "defendDice": 4,
                    "current_bp": 4,
                    "isBoss": True,
                    "spells": ["fear"],
                    "used_spells": ["lightning-bolt"],
                    "forced_next_action": "attack",
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        res_atk = self.player.execute_monster_action("mon-verag")
        self.assertTrue(res_atk.get("success"), "Boss attack action should succeed")

        bdd_step("THEN", "Combat log announces: '[BOSS TACTICS] Verag ... decides to use an attack against Barbarian'")
        st_atk = self.player.get_state()
        logs_atk = st_atk.get("recentCombatLog", st_atk.get("combatLog", []))
        boss_atk_log = next((l for l in reversed(logs_atk) if "[BOSS TACTICS]" in l and "decides to use an attack" in l), None)
        self.assertIsNotNone(
            boss_atk_log,
            f"Expected '[BOSS TACTICS] ... decides to use an attack' in logs. Got: {logs_atk[-6:]}"
        )
        print(f"    ✔ Found Boss Attack Tactics Log: '{boss_atk_log}'")

    def test_03_hard_mode_targeting_prioritizes_weakest_target_like_wizard(self):
        print("\n--- TEST 03: Hard Mode AI Prioritizes Weakest Target (Wizard) ---")
        bdd_step("GIVEN", "Game is switched to 'hard' mode")
        res_diff = self.player.set_difficulty("hard")
        self.assertTrue(res_diff.get("success"))
        self.assertEqual(res_diff.get("difficulty_mode"), "hard")
        self.assertTrue(res_diff.get("is_hard_mode"))

        st = self.player.get_state()
        self.assertEqual(st.get("difficultyMode"), "hard")
        self.assertTrue(st.get("isHardMode"))

        bdd_step("GIVEN", "Barbarian (8 BP, heavy armor) and Wizard (4 BP, fragile) are both reachable in corridor")
        # In open top corridor: Barbarian at [2, 1], Wizard at [6, 1], Orc at [4, 1] (equidistant 2 steps)
        self.player.set_state(
            current_phase="gm_phase",
            difficulty_mode="hard",
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [2, 1], "current_bp": 8, "is_on_board": True},
                {"id": "wizard", "name": "Wizard", "grid_pos": [6, 1], "current_bp": 4, "is_on_board": True},
                {"id": "dwarf", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-orc-tactical",
                    "slug": "orc",
                    "name": "Orc Legionnaire",
                    "grid_pos": [4, 1],
                    "movementSquares": 6,
                    "attackDice": 3,
                    "defendDice": 2,
                    "current_bp": 2,
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Orc Legionnaire executes action in Hard Mode")
        res_act = self.player.execute_monster_action("mon-orc-tactical")
        self.assertTrue(res_act.get("success"))

        bdd_step("THEN", "Orc actively prioritizes Wizard over Barbarian to maximize damage")
        st_after = self.player.get_state()
        logs = st_after.get("recentCombatLog", st_after.get("combatLog", []))
        hard_mode_log = next((l for l in reversed(logs) if "[HARD MODE TACTICS]" in l and "Wizard" in l), None)
        self.assertIsNotNone(
            hard_mode_log,
            f"Expected '[HARD MODE TACTICS] ... focuses on Wizard' in logs. Got: {logs[-6:]}"
        )
        print(f"    ✔ Found Hard Mode Targeting Log: '{hard_mode_log}'")

    def test_04_hard_mode_prioritizes_critical_health_hero_for_lethal_kill(self):
        print("\n--- TEST 04: Hard Mode AI Prioritizes Critical 1-BP Hero to Finish Them Off ---")
        self.player.set_difficulty("hard")

        bdd_step("GIVEN", "Healthy Dwarf (7 BP) and severely wounded Barbarian (1 BP) are both reachable in corridor")
        # In open top corridor: Dwarf at [2, 1] (healthy 7 BP), Barbarian at [6, 1] (critical 1 BP), Orc at [4, 1]
        self.player.set_state(
            current_phase="gm_phase",
            difficulty_mode="hard",
            heroes=[
                {"id": "dwarf", "name": "Dwarf", "grid_pos": [2, 1], "current_bp": 7, "is_on_board": True},
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [6, 1], "current_bp": 1, "is_on_board": True},
                {"id": "wizard", "is_on_board": False, "current_bp": 0},
                {"id": "elf", "is_on_board": False, "current_bp": 0}
            ],
            monsters=[
                {
                    "id": "mon-orc-finisher",
                    "slug": "orc",
                    "name": "Orc Legionnaire",
                    "grid_pos": [4, 1],
                    "movementSquares": 6,
                    "attackDice": 3,
                    "defendDice": 2,
                    "current_bp": 2,
                    "is_alive": True,
                    "roomId": ""
                }
            ],
            clearMonsters=True
        )

        bdd_step("WHEN", "Orc Legionnaire acts in Hard Mode")
        res = self.player.execute_monster_action("mon-orc-finisher")
        self.assertTrue(res.get("success"))

        bdd_step("THEN", "Orc focuses on Barbarian to secure lethal kill (1 BP)")
        st = self.player.get_state()
        logs = st.get("recentCombatLog", st.get("combatLog", []))
        lethal_log = next((l for l in reversed(logs) if "[HARD MODE TACTICS]" in l and "Barbarian" in l), None)
        self.assertIsNotNone(
            lethal_log,
            f"Expected '[HARD MODE TACTICS] ... focuses on Barbarian' in logs. Got: {logs[-6:]}"
        )
        print(f"    ✔ Found Hard Mode Lethal Focus Log: '{lethal_log}'")


if __name__ == "__main__":
    unittest.main()
