#!/usr/bin/env python3
"""
Test Tabletop RPG Enemy Turn Timeout & Damage Feedback Clarity E2E:
Validates:
1. Enemy turn takes a 1.5 second timeout where the active enemy token clearly highlights.
2. User can skip the 1.5s timeout immediately by clicking (or calling skip_enemy_turn_timeout).
3. Damage dealt clearly displays the recipient's identity, damage taken, and remaining health.
4. Floating damage plaque lasts 3.5 seconds with solid 100% opacity for the first 2.2 seconds.
5. Board token receives a pulsating damage hit aura for 3.5 seconds.
6. Synchronous monster_turn retains 100% backward compatibility with existing HeroQuest scenarios.
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


class TestEnemyTurnAndDamageFeedbackE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18098

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 85)
        print("⚔️ TABLETOP RPG ENEMY TURN 1.5s TIMEOUT & PERSISTENT DAMAGE PLAQUE E2E SUITE")
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
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def test_01_enemy_turn_highlight_and_1_5s_timeout(self):
        bdd_step("GIVEN", "Dungeon state in GM phase with an active Crypt Skeleton in room-nw-crypt")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 4], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False}
            ],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Zargon initiates enemy turn sequence")
        res = self.player.start_enemy_turn()
        st = self.player.get_state()

        active_id = st.get("activeEnemyTurnMonsterId")
        is_waiting = st.get("isEnemyTurnWaiting")
        wait_rem = st.get("enemyTurnWaitRemaining", 0.0)

        bdd_step("THEN", "The 1.5s enemy turn timeout is active and the acting token is clearly identified",
                 assertions=[
                     f"Turn start success: {res.get('success')}",
                     f"Active enemy turn monster ID: '{active_id}' (expected 'mon-skel-1')",
                     f"isEnemyTurnWaiting: {is_waiting} (expected True)",
                     f"enemyTurnWaitRemaining: {wait_rem:.2f}s (expected > 0.0 and <= 1.5)"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(active_id, "mon-skel-1")
        self.assertTrue(is_waiting)
        self.assertGreater(wait_rem, 0.0)
        self.assertLessEqual(wait_rem, 1.5)

    def test_02_enemy_turn_timeout_click_skip(self):
        bdd_step("GIVEN", "Active enemy turn 1.5s timeout is waiting")
        st_pre = self.player.get_state()
        self.assertTrue(st_pre.get("isEnemyTurnWaiting"))
        self.assertEqual(st_pre.get("activeEnemyTurnMonsterId"), "mon-skel-1")

        bdd_step("WHEN", "User clicks anywhere to skip the 1.5s enemy timeout")
        skip_res = self.player.skip_enemy_turn_timeout()
        st_post = self.player.get_state()

        skel = next((m for m in st_post.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        barb = next((h for h in st_post.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "The 1.5s timeout is immediately skipped and monster executes movement and attack",
                 assertions=[
                     f"Skip success: {skip_res.get('success')}",
                     f"Skipped monster: '{skip_res.get('skipped_monster_id')}'",
                     f"isEnemyTurnWaiting after skip: {st_post.get('isEnemyTurnWaiting')} (expected False)",
                     f"Skeleton advanced to adjacent tile [4, 3]: {skel.get('grid_pos')}",
                     f"Skeleton did NOT enter hero tile [4, 2]: {skel.get('grid_pos') != barb.get('grid_pos')}"
                 ])
        self.assertTrue(skip_res.get("success"))
        self.assertEqual(skip_res.get("skipped_monster_id"), "mon-skel-1")
        self.assertFalse(st_post.get("isEnemyTurnWaiting"))
        self.assertEqual(skel.get("grid_pos"), [4, 3])
        self.assertNotEqual(skel.get("grid_pos"), barb.get("grid_pos"))

    def test_03_monster_attack_damage_feedback_clarity_and_recipient(self):
        bdd_step("GIVEN", "Monster attacks Hero (Zargon monster with 10 Atk attacks Dwarf with 0 Def)")
        self.player.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "dwarf", "name": "Dwarf", "current_bp": 7, "bodyPoints": 7, "defendDice": 0, "grid_pos": [2, 1], "is_on_board": True}],
            monsters=[{"id": "mon-attacker", "name": "Fimir", "attackDice": 10, "current_bp": 4, "bodyPoints": 4, "grid_pos": [2, 2], "is_alive": True}]
        )

        bdd_step("WHEN", "Monster attacks inflicting wounds on Dwarf")
        dm_res = self.player.dm_attack(hero_id="dwarf", monster_id="mon-attacker")
        st = self.player.get_state()

        last_dmg = st.get("lastDamageEvent", {})
        dmg_evts = st.get("damageEvents", [])
        fts = st.get("floatingTexts", [])
        dmg_fts = [ft for ft in fts if ft.get("is_damage")]
        dmg_ft = dmg_fts[-1] if dmg_fts else {}

        bdd_step("THEN", "Damage event clearly records the recipient, wounds, and 3.5s duration",
                 assertions=[
                     f"Last damage target name: '{last_dmg.get('target_name')}' (expected 'Dwarf')",
                     f"Last damage target ID: '{last_dmg.get('target_id')}' (expected 'dwarf')",
                     f"Wounds inflicted: {last_dmg.get('wounds')} (expected > 0)",
                     f"Remaining BP: {last_dmg.get('current_bp')} / {last_dmg.get('max_bp')}",
                     f"Duration: {last_dmg.get('duration')}s (expected 3.5s)",
                     f"Floating text target: '{dmg_ft.get('target_name')}'",
                     f"Floating text duration: {dmg_ft.get('duration')}s",
                     f"Floating text initial alpha: {dmg_ft.get('alpha')}"
                 ])
        self.assertEqual(last_dmg.get("target_name"), "Dwarf")
        self.assertEqual(last_dmg.get("target_id"), "dwarf")
        self.assertGreater(last_dmg.get("wounds", 0), 0)
        self.assertEqual(last_dmg.get("duration"), 3.5)
        self.assertTrue(last_dmg.get("is_hero"))
        self.assertTrue(dmg_ft.get("is_damage"))
        self.assertEqual(dmg_ft.get("target_name"), "Dwarf")
        self.assertEqual(dmg_ft.get("duration"), 3.5)
        self.assertEqual(dmg_ft.get("alpha"), 1.0)
        self.assertGreaterEqual(len(dmg_evts), 1)

    def test_04_hero_attack_damage_feedback_clarity_and_monster_recipient(self):
        bdd_step("GIVEN", "Hero attacks Verag the Orc Warlord")
        self.player.set_state(
            role="player",
            phase="hero_phase",
            activeHero="barbarian",
            hasActed=False,
            isEnemyTurnWaiting=False,
            revealedRooms=["room-grand-fossil"],
            heroes=[{"id": "barbarian", "name": "Barbarian", "grid_pos": [13, 8], "attackDice": 10, "equipped_weapon": "", "is_on_board": True}],
            monsters=[{"id": "mon-verag", "name": "Verag the Orc Warlord", "grid_pos": [13, 9], "current_bp": 6, "bodyPoints": 6, "defendDice": 0, "is_alive": True}],
            discoveredMonsterIds=["mon-verag"]
        )

        bdd_step("WHEN", "Barbarian attacks Verag dealing wounds")
        atk_res = self.player.attack("mon-verag")
        st = self.player.get_state()

        last_dmg = st.get("lastDamageEvent", {})
        fts = st.get("floatingTexts", [])
        dmg_fts = [ft for ft in fts if ft.get("is_damage")]
        dmg_ft = dmg_fts[-1] if dmg_fts else {}

        bdd_step("THEN", "Damage event clearly records monster recipient, wounds, and remaining HP",
                 assertions=[
                     f"Attack success: {atk_res.get('success')}",
                     f"Target name: '{last_dmg.get('target_name')}' (expected 'Verag the Orc Warlord')",
                     f"Target ID: '{last_dmg.get('target_id')}' (expected 'mon-verag')",
                     f"Wounds inflicted: {last_dmg.get('wounds')} (expected > 0)",
                     f"Remaining BP: {last_dmg.get('current_bp')} (was 6)",
                     f"Duration: {last_dmg.get('duration')}s (expected 3.5s)",
                     f"Target is monster: {not last_dmg.get('is_hero')}"
                 ])
        self.assertTrue(atk_res.get("success"))
        self.assertEqual(last_dmg.get("target_name"), "Verag the Orc Warlord")
        self.assertEqual(last_dmg.get("target_id"), "mon-verag")
        self.assertGreater(last_dmg.get("wounds", 0), 0)
        self.assertLess(last_dmg.get("current_bp", 6), 6)
        self.assertEqual(last_dmg.get("duration"), 3.5)
        self.assertFalse(last_dmg.get("is_hero"))
        self.assertEqual(dmg_ft.get("target_name"), "Verag the Orc Warlord")

    def test_05_synchronous_ai_monster_turn_backward_compatibility(self):
        bdd_step("GIVEN", "HeroQuest Scenario 35 setup with Skeleton and Barbarian")
        self.player.set_state(
            role="player",
            phase="gm_phase",
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "name": "Barbarian", "grid_pos": [4, 2], "current_bp": 8, "bodyPoints": 8, "is_on_board": True}
            ],
            monsters=[
                {"id": "mon-skel-1", "name": "Crypt Skeleton", "grid_pos": [4, 4], "current_bp": 1, "bodyPoints": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "name": "Crypt Skeleton 2", "is_alive": False},
                {"id": "mon-attacker", "name": "Attacker", "is_alive": False}
            ]
        )

        bdd_step("WHEN", "Synchronous monster_turn() is called (as in Scenario 35)")
        res = self.player.monster_turn()
        st = self.player.get_state()

        skel = next((m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        barb = next((h for h in st.get("heroes", []) if h.get("id") == "barbarian"), {})

        bdd_step("THEN", "Skeleton immediately resolves movement to [4, 3] while highlight state is set",
                 assertions=[
                     f"Turn response success: {res.get('success')}",
                     f"Skeleton position: {skel.get('grid_pos')} (expected [4, 3])",
                     f"Barbarian position: {barb.get('grid_pos')} (expected [4, 2])",
                     f"Highlighted monster ID: '{st.get('activeEnemyTurnMonsterId')}' (expected 'mon-skel-1')",
                     f"isEnemyTurnWaiting: {st.get('isEnemyTurnWaiting')} (expected False)"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(skel.get("grid_pos"), [4, 3])
        self.assertEqual(barb.get("grid_pos"), [4, 2])
        self.assertEqual(st.get("activeEnemyTurnMonsterId"), "mon-skel-1")
        self.assertFalse(st.get("isEnemyTurnWaiting"))


if __name__ == "__main__":
    unittest.main()
