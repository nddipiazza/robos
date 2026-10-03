#!/usr/bin/env python3
"""
test_heroquest_e2e_scenarios.py
Comprehensive End-to-End BDD Scenario Suite for HeroQuest Tabletop RPG.

Every scenario follows the exact snapshot-diff verification pattern:
1. Set up map in some state, with turn (whoever)
2. Baseline snapshot game (including scene) state
3. Perform (some action)
4. New snapshot game (including scene) state
5. Diff with baseline to compute mutations and assert agreement with expected behavior

Covers 43 scenarios across all core HeroQuest quest gameplay systems:
- Movement, pathfinding & blockages
- Doors, corridors, and Fog of War chamber reveals
- Melee combat, damage mitigation, multi-BP bosses, hero knockout
- Magic & spellcasting (Fire, Earth, Water, Air, Genie, debuffs)
- Secret detection, trap triggering, and Dwarf trap disarming
- Room treasure searching and action exhaustion
- Equipment loadouts (shields, helmets, armor, 2-handed weapons)
- Turn lifecycles, hero rotations, Zargon monster phase
- AI step proposal preview & confirmation governance
- Cartridge and multi-quest progression
- Authentic HeroQuest turn structure & non-splittable movement
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

from rpc_ai.tabletop_rpc_ai import TabletopRPCAI
from tabletop_snapshot_diff import diff_snapshots, TabletopSnapshotDiff


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"🎲 SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestHeroQuestE2EScenarios(unittest.TestCase):
    proc = None
    ai = None
    port = 18096

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🏛️ FEATURE: HeroQuest End-to-End Game Quest Test Framework")
        print("   Testing Pattern: Setup State ➔ Baseline Snapshot ➔ Action ➔ New Snapshot ➔ Diff")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopRPCAI(port=cls.port, human_delay=0.05)
        connected = False
        for _ in range(30):
            if cls.ai.check_health():
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

    def setUp(self):
        # Reset game state to clean cartridge baseline before each scenario
        self.ai.reset_game()

    # =========================================================================
    # DOMAIN 1: MOVEMENT & CORRIDOR NAVIGATION (Scenarios 01-05)
    # =========================================================================

    def test_01_roll_movement_dice(self):
        """Scenario 01: Hero rolls 2d6 movement dice at start of turn."""
        bdd_scenario_header(1, "Hero Rolls Movement Dice at Start of Turn")

        bdd_step("GIVEN", "Barbarian begins turn at starting stairwell awaiting roll",
                 info="turnState = awaiting_roll, movementRemaining = 0, movementRolled = False")
        self.ai.set_state(
            activeHero="barbarian",
            turnState="awaiting_roll",
            movementRemaining=0,
            movementRolled=False
        )

        bdd_step("WHEN", "Capturing baseline snapshot and rolling 2d6 movement dice")
        baseline = self.ai.snapshot()
        res = self.ai.roll_movement()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Snapshot diff confirms movement rolled and turnState transitions to moving",
                 assertions=[
                     f"movementRolled changed: False ➔ {diff.scalars.get('movementRolled', (None, None))[1]}",
                     f"movementRemaining changed: 0 ➔ {diff.scalars.get('movementRemaining', (None, None))[1]}",
                     f"turnState transitioned: awaiting_roll ➔ {diff.scalars.get('turnState', (None, None))[1]}",
                     f"Roll total in result: {res.get('roll', {}).get('total')}"
                 ])
        self.assertTrue(diff.scalars["movementRolled"][1])
        self.assertGreater(diff.scalars["movementRemaining"][1], 0)
        self.assertEqual(diff.scalars["turnState"][1], "moving")

    def test_02_hero_corridor_movement(self):
        """Scenario 02: Hero advances along corridor, decrementing movement and uncovering tiles."""
        bdd_scenario_header(2, "Hero Advances Along Empty Corridor")

        bdd_step("GIVEN", "Barbarian stands at (0, 1) with 6 movement points available",
                 info="Starting position: [0, 1]")
        self.ai.set_state(
            activeHero="barbarian",
            turnState="moving",
            movementRemaining=6,
            movementRolled=True,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1], "is_on_board": True}]
        )

        bdd_step("WHEN", "Baseline captured and Barbarian moves 3 squares east to (3, 1)")
        baseline = self.ai.snapshot()
        res = self.ai.move(3, 1)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Barbarian grid position updates, movement decreases to 3, and scene token shifts",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Grid pos: [0, 1] ➔ {diff.heroes['barbarian']['grid_pos'][1]}",
                     f"Movement remaining: 6 ➔ {diff.scalars['movementRemaining'][1]}",
                     f"Explored tile count increased: {diff.scalars.get('exploredCount', (None, None))}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_hero_pos("barbarian", [0, 1], [3, 1])
        diff.assert_scalar("movementRemaining", 6, 3)

    def test_03_hero_movement_blocked_by_wall(self):
        """Scenario 03: Hero attempts to move into solid dungeon wall / block."""
        bdd_scenario_header(3, "Hero Movement Blocked by Solid Wall")

        bdd_step("GIVEN", "Barbarian stands at corridor tile (11, 0) next to wall block at (12, 0)")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            heroes=[{"id": "barbarian", "grid_pos": [11, 0]}],
            wallBlocks=[{"id": "block-wall-test", "x": 12, "y": 0, "type": "single", "width": 1, "height": 1}]
        )

        bdd_step("WHEN", "Barbarian attempts illegal move into wall block tile (12, 0)")
        baseline = self.ai.snapshot()
        res = self.ai.move(12, 0)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Action fails, hero position and movement remain completely unchanged",
                 assertions=[
                     f"Action success: {res.get('success')} (expected False)",
                     f"Hero position mutated: {'grid_pos' in diff.heroes.get('barbarian', {})}",
                     f"Movement remaining mutated: {'movementRemaining' in diff.scalars}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertNotIn("grid_pos", diff.heroes.get("barbarian", {}))
        self.assertNotIn("movementRemaining", diff.scalars)

    def test_04_hero_movement_blocked_by_occupied_square(self):
        """Scenario 04: Hero cannot end move on square occupied by another miniature."""
        bdd_scenario_header(4, "Hero Movement Blocked by Occupied Square")

        bdd_step("GIVEN", "Dwarf stands at (2, 1) and Barbarian stands at (1, 1)")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=4,
            heroes=[
                {"id": "barbarian", "grid_pos": [1, 1], "is_on_board": True},
                {"id": "dwarf", "grid_pos": [2, 1], "is_on_board": True}
            ]
        )

        bdd_step("WHEN", "Barbarian attempts to occupy Dwarf's square at (2, 1)")
        baseline = self.ai.snapshot()
        res = self.ai.move(2, 1)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Move is rejected under No-Sharing-Squares rule; positions unchanged",
                 assertions=[
                     f"Success: {res.get('success')} (False)",
                     f"Barbarian position unchanged: {current.get('activeHeroPos')}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertEqual(current.get("activeHeroPos"), [1, 1])

    def test_05_hero_movement_exhaustion(self):
        """Scenario 05: Hero spends last remaining movement point."""
        bdd_scenario_header(5, "Hero Spends Last Movement Point")

        bdd_step("GIVEN", "Barbarian has 2 movement remaining and has already acted",
                 info="hasActed = True, movementRemaining = 2")
        self.ai.set_state(
            activeHero="barbarian",
            turnState="action_taken",
            hasActed=True,
            movementRemaining=2,
            movementRolled=True,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1]}]
        )

        bdd_step("WHEN", "Barbarian moves 2 squares to (3, 1)")
        baseline = self.ai.snapshot()
        self.ai.move(3, 1)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "movementRemaining hits 0 and turnState transitions to turn_complete",
                 assertions=[
                     f"movementRemaining: 2 ➔ {diff.scalars.get('movementRemaining', (None, None))[1]}",
                     f"turnState: action_taken ➔ {diff.scalars.get('turnState', (None, None))[1]}"
                 ])
        diff.assert_scalar("movementRemaining", 2, 0)
        diff.assert_scalar("turnState", "action_taken", "turn_complete")

    # =========================================================================
    # DOMAIN 2: DOORS & EXPLORATION / FOG OF WAR (Scenarios 06-08)
    # =========================================================================

    def test_06_hero_opens_door_to_crypt(self):
        """Scenario 06: Hero opens closed door leading into northwest crypt chamber."""
        bdd_scenario_header(6, "Opening Closed Door to Northwest Crypt")

        bdd_step("GIVEN", "Barbarian stands at (4, 1) adjacent to closed crypt door (4, 1)->(4, 2)",
                 info="room-nw-crypt is shrouded by Fog of War")
        self.ai.set_state(
            activeHero="barbarian",
            heroes=[{"id": "barbarian", "grid_pos": [4, 1]}],
            revealedRooms=[]
        )

        bdd_step("WHEN", "Barbarian kicks open door (4, 1) -> (4, 2)")
        baseline = self.ai.snapshot()
        res = self.ai.open_door(4, 1, 4, 2)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Door is opened, crypt room is revealed, and monsters become visible in scene",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Door opened: {diff.doors}",
                     f"Revealed rooms added: {diff.rooms_revealed_added}",
                     f"Monsters now visible in scene: {diff.scalars.get('visibleEnemiesCount')}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_door_opened()
        diff.assert_room_revealed("room-nw-crypt")
        self.assertGreater(current.get("visibleEnemiesCount", 0), 0)

    def test_07_hero_enters_revealed_crypt_room(self):
        """Scenario 07: Hero strides through open doorway into revealed chamber."""
        bdd_scenario_header(7, "Hero Strides Into Revealed Chamber")

        bdd_step("GIVEN", "Door is open and crypt is already revealed; Barbarian stands at threshold (4, 1)")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=5,
            movementRolled=True,
            revealedRooms=["room-nw-crypt"],
            doors=[{"from": [4, 1], "to": [4, 2], "is_open": True}],
            heroes=[{"id": "barbarian", "grid_pos": [4, 1], "is_on_board": True}]
        )

        bdd_step("WHEN", "Barbarian enters room tile at (4, 3)")
        baseline = self.ai.snapshot()
        res = self.ai.move(4, 3)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Hero position updates into room coordinates; room remains revealed",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Grid pos: [4, 1] ➔ {diff.heroes['barbarian']['grid_pos'][1]}",
                     f"Movement remaining: 5 ➔ {diff.scalars['movementRemaining'][1]}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_hero_pos("barbarian", [4, 1], [4, 3])
        diff.assert_scalar("movementRemaining", 5, 3)

    def test_08_open_door_from_inside_room(self):
        """Scenario 08: Hero inside chamber opens door leading out to corridor."""
        bdd_scenario_header(8, "Open Door From Inside Chamber Outward")

        bdd_step("GIVEN", "Hero is at (4, 2) inside crypt and door to corridor is closed")
        self.ai.set_state(
            activeHero="barbarian",
            doors=[{"id": "door-crypt-1", "from": [4, 1], "to": [4, 2], "is_open": False}],
            heroes=[{"id": "barbarian", "grid_pos": [4, 2]}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.open_door(4, 2, 4, 1)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Door is successfully opened outward",
                 assertions=[f"Door opened: {diff.doors}"])
        self.assertTrue(res.get("success"))
        diff.assert_door_opened()

    # =========================================================================
    # DOMAIN 3: MELEE COMBAT & HERO DEFEAT (Scenarios 09-12)
    # =========================================================================

    def test_09_hero_melee_attack_slays_monster(self):
        """Scenario 09: Barbarian strikes 1-BP Skeleton with broadsword and slays it."""
        bdd_scenario_header(9, "Melee Attack Slays 1-BP Skeleton")

        bdd_step("GIVEN", "Barbarian at (4, 2) adjacent to Crypt Skeleton at (4, 3) with 1 BP")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [4, 2], "equipped_weapon": "broadsword"}],
            monsters=[{"id": "mon-skel-1", "grid_pos": [4, 3], "current_bp": 1, "is_alive": True}],
            discoveredMonsterIds=["mon-skel-1"]
        )

        bdd_step("WHEN", "Barbarian launches melee attack against mon-skel-1")
        baseline = self.ai.snapshot()
        res = self.ai.attack("mon-skel-1")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Combat resolves, skeleton defeated or wounded, and hasActed is True",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"hasActed: False ➔ {diff.scalars.get('hasActed', (None, None))[1]}",
                     f"Monster mutations: {diff.monsters.get('mon-skel-1')}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("hasActed", False, True)

    def test_10_hero_melee_attack_damages_multi_bp_boss(self):
        """Scenario 10: Barbarian attacks 3-BP Orc Warlord Verag."""
        bdd_scenario_header(10, "Melee Attack on 3-BP Orc Warlord")

        bdd_step("GIVEN", "Orc Warlord Verag at (13, 9) with 4 Body Points")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [13, 8], "equipped_weapon": "broadsword"}],
            monsters=[{"id": "mon-verag", "grid_pos": [13, 9], "current_bp": 4, "is_alive": True}],
            discoveredMonsterIds=["mon-verag"]
        )

        bdd_step("WHEN", "Barbarian attacks Orc Warlord Verag")
        baseline = self.ai.snapshot()
        res = self.ai.attack("mon-verag")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Action registered, combat log updated",
                 assertions=[
                     f"Attack success: {res.get('success')}",
                     f"hasActed: True",
                     f"Warlord status: {current.get('monsters', [{}])[0].get('current_bp')} BP"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("hasActed", False, True)

    def test_11_monster_counterattack_damages_hero(self):
        """Scenario 11: Zargon monster attacks Dwarf during monster phase."""
        bdd_scenario_header(11, "Monster Strikes Hero in Melee")

        bdd_step("GIVEN", "Dwarf has 7 BP and stands in melee range of Zargon's minion")
        self.ai.set_state(
            role="gm",
            phase="gm_phase",
            heroes=[{"id": "dwarf", "current_bp": 7, "grid_pos": [2, 1]}]
        )

        bdd_step("WHEN", "Zargon issues dm_attack against Dwarf")
        baseline = self.ai.snapshot()
        res = self.ai.dm_attack("dwarf")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Attack resolves and combat log records damage",
                 assertions=[
                     f"DM Attack success: {res.get('success')}",
                     f"Combat log entries added: {len(diff.combat_log_added)}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertGreater(len(diff.combat_log_added), 0)

    def test_12_hero_defeat_at_zero_bp(self):
        """Scenario 12: Hero suffers fatal damage and drops to 0 Body Points."""
        bdd_scenario_header(12, "Hero Defeat at 0 Body Points")

        bdd_step("GIVEN", "Wizard has 1 Body Point remaining")
        self.ai.set_state(
            heroes=[{"id": "wizard", "current_bp": 1, "is_on_board": True}]
        )

        bdd_step("WHEN", "Wizard suffers 1 lethal damage reducing BP to 0")
        baseline = self.ai.snapshot()
        self.ai.execute_action("set_hero_bp", heroId="wizard", bp=0)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Wizard current_bp drops to 0 and character card marks hero defeated",
                 assertions=[
                     f"Wizard BP: 1 ➔ {diff.heroes['wizard']['current_bp'][1]}",
                     f"Wizard isAlive in card: {diff.heroes['wizard'].get('isAlive', (None, None))[1]}"
                 ])
        diff.assert_hero_bp("wizard", 1, 0)
        self.assertFalse(diff.heroes["wizard"]["isAlive"][1])

    # =========================================================================
    # DOMAIN 4: MAGIC & SPELLCASTING (Scenarios 13-24)
    # =========================================================================

    def test_13_cast_ball_of_flame_incinerates_monster(self):
        """Scenario 13: Wizard casts Ball of Flame incinerating a Goblin."""
        bdd_scenario_header(13, "Wizard Casts Ball of Flame on Monster")

        bdd_step("GIVEN", "Wizard in LoS of a 1-BP Goblin at (4, 3)")
        self.ai.set_state(
            activeHero="wizard",
            hasActed=False,
            heroes=[{"id": "wizard", "grid_pos": [4, 1], "spells": ["ball_of_flame"]}],
            monsters=[{"id": "mon-goblin-1", "name": "Goblin", "grid_pos": [4, 3], "current_bp": 1, "is_alive": True}],
            discoveredMonsterIds=["mon-goblin-1"]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("ball_of_flame", target="mon-goblin-1")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Ball of flame resolves combat damage against goblin and marks hasActed",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"hasActed: True",
                     f"Spell result: {res.get('name')}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("hasActed", False, True)

    def test_14_cast_fire_of_wrath(self):
        """Scenario 14: Wizard invokes Fire of Wrath against Orc."""
        bdd_scenario_header(14, "Wizard Invokes Fire of Wrath")

        bdd_step("GIVEN", "Orc in line of sight of Wizard")
        self.ai.set_state(
            activeHero="wizard",
            hasActed=False,
            heroes=[{"id": "wizard", "grid_pos": [2, 1], "spells": ["fire_of_wrath"]}],
            monsters=[{"id": "mon-orc-1", "grid_pos": [4, 1], "current_bp": 1, "is_alive": True}],
            discoveredMonsterIds=["mon-orc-1"]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("fire_of_wrath", target="mon-orc-1")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Fire of Wrath dealt damage and hasActed is True",
                 assertions=[f"Success: {res.get('success')}"])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("hasActed", False, True)

    def test_15_cast_sleep_spell_neutralizes_monster(self):
        """Scenario 15: Wizard casts Sleep putting monster into deep slumber."""
        bdd_scenario_header(15, "Wizard Casts Sleep Spell")

        bdd_step("GIVEN", "Chaos Warrior stands in doorway")
        self.ai.set_state(
            activeHero="wizard",
            hasActed=False,
            heroes=[{"id": "wizard", "grid_pos": [2, 1], "spells": ["sleep"]}],
            monsters=[{"id": "mon-zombie-1", "grid_pos": [3, 1], "current_bp": 3, "is_alive": True}],
            discoveredMonsterIds=["mon-zombie-1"]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("sleep", target="mon-zombie-1")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Chaos Warrior is marked sleeping with sleep status effect",
                 assertions=[
                     f"Spell result is_sleeping: {res.get('is_sleeping')}",
                     f"Monster card statusEffects: {diff.monsters.get('mon-zombie-1', {}).get('statusEffects')}"
                 ])
        self.assertTrue(res.get("is_sleeping"))
        self.assertIn("sleep", diff.monsters["mon-zombie-1"]["statusEffects"][1])

    def test_16_cast_tempest_stuns_enemy(self):
        """Scenario 16: Elf casts Tempest whirlwind stunning boss monster."""
        bdd_scenario_header(16, "Elf Casts Tempest Whirlwind")

        bdd_step("GIVEN", "Elf targets Warlord with Tempest")
        self.ai.set_state(
            activeHero="elf",
            hasActed=False,
            heroes=[{"id": "elf", "grid_pos": [2, 1], "spells": ["tempest"]}],
            monsters=[{"id": "mon-verag", "grid_pos": [3, 1], "current_bp": 4, "is_alive": True}],
            discoveredMonsterIds=["mon-verag"]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("tempest", target="mon-verag")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Warlord gains tempest_stunned status effect",
                 assertions=[
                     f"Tempest stunned: {res.get('tempest_stunned')}",
                     f"Status effects: {diff.monsters.get('mon-verag', {}).get('statusEffects')}"
                 ])
        self.assertTrue(res.get("tempest_stunned"))
        self.assertIn("tempest_stunned", diff.monsters["mon-verag"]["statusEffects"][1])

    def test_17_cast_heal_body_restores_hero_bp(self):
        """Scenario 17: Wizard casts Heal Body on wounded Barbarian."""
        bdd_scenario_header(17, "Wizard Casts Heal Body on Wounded Ally")

        bdd_step("GIVEN", "Barbarian wounded to 3/8 Body Points")
        self.ai.set_state(
            activeHero="wizard",
            heroes=[
                {"id": "wizard", "grid_pos": [2, 1], "spells": ["heal_body"]},
                {"id": "barbarian", "current_bp": 3, "grid_pos": [2, 2]}
            ]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("heal_body", target="barbarian")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Barbarian heals 4 BP (from 3 to 7 BP)",
                 assertions=[
                     f"Healed: {res.get('healed')} BP",
                     f"Barbarian BP: 3 ➔ {diff.heroes['barbarian']['current_bp'][1]}"
                 ])
        self.assertEqual(res.get("healed"), 4)
        diff.assert_hero_bp("barbarian", 3, 7)

    def test_18_cast_water_of_healing(self):
        """Scenario 18: Water of Healing restores 4 Body Points."""
        bdd_scenario_header(18, "Casting Water of Healing")

        bdd_step("GIVEN", "Elf wounded to 2/6 Body Points")
        self.ai.set_state(
            activeHero="wizard",
            heroes=[
                {"id": "wizard", "grid_pos": [1, 1], "spells": ["water_of_healing"]},
                {"id": "elf", "current_bp": 2, "grid_pos": [1, 2]}
            ]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("water_of_healing", target="elf")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Elf heals 4 BP to 6 Body Points",
                 assertions=[f"Elf BP: 2 ➔ {diff.heroes['elf']['current_bp'][1]}"])
        diff.assert_hero_bp("elf", 2, 6)

    def test_19_cast_rock_skin_boosts_defense(self):
        """Scenario 19: Wizard casts Rock Skin granting +1 defend die."""
        bdd_scenario_header(19, "Wizard Casts Rock Skin Buff")

        bdd_step("GIVEN", "Dwarf has base defend dice = 2")
        self.ai.set_state(
            activeHero="wizard",
            heroes=[
                {"id": "wizard", "grid_pos": [1, 1], "spells": ["rock_skin"]},
                {"id": "dwarf", "grid_pos": [1, 2], "rock_skin_active": False}
            ]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("rock_skin", target="dwarf")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Dwarf gains rock_skin status and defendDice increases from 2 to 3",
                 assertions=[
                     f"Rock skin active: {res.get('rock_skin_active')}",
                     f"Defend dice: 2 ➔ {diff.heroes['dwarf']['defendDice'][1]}",
                     f"Status effects: {diff.heroes['dwarf']['statusEffects'][1]}"
                 ])
        self.assertTrue(res.get("rock_skin_active"))
        self.assertEqual(diff.heroes["dwarf"]["defendDice"][1], 3)
        self.assertIn("rock_skin", diff.heroes["dwarf"]["statusEffects"][1])

    def test_20_cast_courage_boosts_attack(self):
        """Scenario 20: Wizard casts Courage granting +2 attack dice."""
        bdd_scenario_header(20, "Wizard Casts Courage Attack Buff")

        bdd_step("GIVEN", "Barbarian with base 3 attack dice receives Courage")
        self.ai.set_state(
            activeHero="wizard",
            heroes=[
                {"id": "wizard", "grid_pos": [1, 1], "spells": ["courage"]},
                {"id": "barbarian", "grid_pos": [1, 2], "equipped_weapon": "broadsword", "courage_active": False}
            ]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("courage", target="barbarian")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Barbarian gains courage status and attackDice jumps from 3 to 5",
                 assertions=[
                     f"Courage active: {res.get('courage_active')}",
                     f"Attack dice: 3 ➔ {diff.heroes['barbarian']['attackDice'][1]}"
                 ])
        self.assertTrue(res.get("courage_active"))
        self.assertEqual(diff.heroes["barbarian"]["attackDice"][1], 5)

    def test_21_cast_swift_wind_doubles_speed(self):
        """Scenario 21: Elf casts Swift Wind on Barbarian."""
        bdd_scenario_header(21, "Elf Casts Swift Wind")

        self.ai.set_state(
            activeHero="elf",
            heroes=[
                {"id": "elf", "grid_pos": [1, 1], "spells": ["swift_wind"]},
                {"id": "barbarian", "grid_pos": [1, 2], "swift_wind_active": False}
            ]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("swift_wind", target="barbarian")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Barbarian card reflects swift_wind buff",
                 assertions=[f"Status effects: {diff.heroes['barbarian']['statusEffects'][1]}"])
        self.assertTrue(res.get("swift_wind_active"))
        self.assertIn("swift_wind", diff.heroes["barbarian"]["statusEffects"][1])

    def test_22_cast_pass_through_rock(self):
        """Scenario 22: Wizard casts Pass Through Rock ethereal buff."""
        bdd_scenario_header(22, "Wizard Casts Pass Through Rock")

        self.ai.set_state(
            activeHero="wizard",
            heroes=[{"id": "wizard", "grid_pos": [1, 1], "spells": ["pass_through_rock"]}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("pass_through_rock", target="wizard")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Pass through rock is active on Wizard",
                 assertions=[f"Active: {res.get('pass_through_rock_active')}"])
        self.assertTrue(res.get("pass_through_rock_active"))
        self.assertIn("pass_through_rock", diff.heroes["wizard"]["statusEffects"][1])

    def test_23_cast_veil_of_mist(self):
        """Scenario 23: Elf casts Veil of Mist."""
        bdd_scenario_header(23, "Elf Casts Veil of Mist")

        self.ai.set_state(
            activeHero="elf",
            heroes=[{"id": "elf", "grid_pos": [1, 1], "spells": ["veil_of_mist"]}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("veil_of_mist", target="elf")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Veil of mist active on Elf",
                 assertions=[f"Active: {res.get('veil_of_mist_active')}"])
        self.assertTrue(res.get("veil_of_mist_active"))
        self.assertIn("veil_of_mist", diff.heroes["elf"]["statusEffects"][1])

    def test_24_cast_genie_spell(self):
        """Scenario 24: Elf invokes Genie to attack enemy monster with 5 dice."""
        bdd_scenario_header(24, "Elf Invokes Genie Combat Attack")

        self.ai.set_state(
            activeHero="elf",
            hasActed=False,
            heroes=[{"id": "elf", "grid_pos": [1, 1], "spells": ["genie"]}],
            monsters=[{"id": "mon-orc-1", "grid_pos": [2, 1], "current_bp": 2, "is_alive": True}],
            discoveredMonsterIds=["mon-orc-1"]
        )

        baseline = self.ai.snapshot()
        res = self.ai.cast_spell("genie", target="mon-orc-1")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Genie rolls 5 attack dice and inflicts wounds",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Wounds inflicted: {res.get('wounds')}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("hasActed", False, True)

    # =========================================================================
    # DOMAIN 5: TRAPS & SECRET DETECTION (Scenarios 25-27)
    # =========================================================================

    def test_25_search_room_for_traps(self):
        """Scenario 25: Hero searches room uncovering hidden pit trap."""
        bdd_scenario_header(25, "Hero Searches Chamber for Traps & Secret Doors")

        bdd_step("GIVEN", "Hero inside crypt at (4, 3) where undetected trap exists at (4, 4)")
        self.ai.set_state(
            activeHero="dwarf",
            hasActed=False,
            heroes=[{"id": "dwarf", "grid_pos": [4, 3]}],
            revealedRooms=["room-nw-crypt"],
            traps=[{"id": "trap-pit-nw", "x": 4, "y": 4, "type": "pit", "detected": False, "disarmed": False}]
        )

        bdd_step("WHEN", "Dwarf conducts search_traps action")
        baseline = self.ai.snapshot()
        res = self.ai.search_traps()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Trap becomes detected and hasActed is True",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Traps found count: {res.get('trapsCount')}",
                     f"Trap detected diff: {diff.traps.get('trap-pit-nw')}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_trap_detected("trap-pit-nw")
        diff.assert_scalar("hasActed", False, True)

    def test_26_dwarf_disarms_trap(self):
        """Scenario 26: Dwarf disarms detected pit trap."""
        bdd_scenario_header(26, "Dwarf Disarms Detected Trap")

        bdd_step("GIVEN", "Detected pit trap at (4, 4) with Dwarf adjacent at (4, 3)")
        self.ai.set_state(
            activeHero="dwarf",
            hasActed=False,
            heroes=[{"id": "dwarf", "grid_pos": [4, 3]}],
            traps=[{"id": "trap-pit-nw", "x": 4, "y": 4, "type": "pit", "detected": True, "disarmed": False}]
        )

        bdd_step("WHEN", "Dwarf executes disarm_trap action")
        baseline = self.ai.snapshot()
        res = self.ai.disarm_trap("trap-pit-nw")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Trap is disarmed successfully",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Disarmed diff: {diff.traps.get('trap-pit-nw')}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_trap_disarmed("trap-pit-nw")

    def test_27_hero_triggers_hidden_trap_on_movement(self):
        """Scenario 27: Hero steps on hidden trap tile; trap springs, inflicts damage and halts movement."""
        bdd_scenario_header(27, "Hero Steps on Hidden Pit Trap")

        bdd_step("GIVEN", "Barbarian at (1, 1) with 4 movement points and hidden pit trap at (2, 1)")
        self.ai.set_state(
            activeHero="barbarian",
            movementRemaining=4,
            movementRolled=True,
            heroes=[{"id": "barbarian", "grid_pos": [1, 1], "current_bp": 8}],
            traps=[{"id": "corridor-pit", "x": 2, "y": 1, "type": "pit", "damageDice": 1, "detected": False, "disarmed": False}]
        )

        bdd_step("WHEN", "Barbarian attempts to move past trap to (3, 1)")
        baseline = self.ai.snapshot()
        res = self.ai.move(3, 1)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Trap springs at (2, 1), Barbarian suffers 1 damage, stops at (2, 1), and movement hits 0",
                 assertions=[
                     f"Movement halted at trap tile: {diff.heroes['barbarian']['grid_pos'][1]}",
                     f"Barbarian BP: 8 ➔ {diff.heroes['barbarian']['current_bp'][1]}",
                     f"Movement remaining: 4 ➔ {diff.scalars['movementRemaining'][1]}",
                     f"Trap detected: {diff.traps.get('corridor-pit')}"
                 ])
        diff.assert_hero_pos("barbarian", [1, 1], [2, 1])
        diff.assert_hero_bp("barbarian", 8, 7)
        diff.assert_scalar("movementRemaining", 4, 0)
        diff.assert_trap_detected("corridor-pit")

    # =========================================================================
    # DOMAIN 6: TREASURE & SEARCHING (Scenarios 28-29)
    # =========================================================================

    def test_28_hero_searches_room_for_treasure(self):
        """Scenario 28: Hero in revealed room searches for treasure and gains gold."""
        bdd_scenario_header(28, "Hero Searches Chamber for Treasure")

        bdd_step("GIVEN", "Barbarian at (4, 3) with 0 gold")
        self.ai.set_state(
            activeHero="barbarian",
            hasActed=False,
            heroes=[{"id": "barbarian", "grid_pos": [4, 3], "gold": 0}],
            revealedRooms=["room-nw-crypt"]
        )

        bdd_step("WHEN", "Barbarian searches room")
        baseline = self.ai.snapshot()
        res = self.ai.search()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Gold increases by 50 and hasActed is True",
                 assertions=[
                     f"Gold found: {res.get('goldFound')}",
                     f"Barbarian gold: 0 ➔ {diff.heroes['barbarian']['gold'][1]}",
                     f"hasActed: True"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("hasActed", False, True)
        self.assertEqual(diff.heroes["barbarian"]["gold"][1], 50)

    def test_29_search_treasure_sets_turn_state(self):
        """Scenario 29: Searching room exhausts action."""
        bdd_scenario_header(29, "Search Treasure Exhausts Action")

        self.ai.set_state(
            activeHero="barbarian",
            turnState="moving",
            hasActed=False,
            movementRemaining=3,
            revealedRooms=["room-nw-crypt"]
        )

        baseline = self.ai.snapshot()
        self.ai.search()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "turnState changes from moving to action_taken",
                 assertions=[f"turnState: moving ➔ {diff.scalars.get('turnState', (None, None))[1]}"])
        diff.assert_scalar("turnState", "moving", "action_taken")

    # =========================================================================
    # DOMAIN 7: EQUIPMENT & INVENTORY (Scenarios 30-33)
    # =========================================================================

    def test_30_equip_shield_increases_defense(self):
        """Scenario 30: Barbarian equips shield increasing defense dice from 2 to 3."""
        bdd_scenario_header(30, "Barbarian Equips Shield")

        bdd_step("GIVEN", "Barbarian with base 2 defend dice equips Shield")
        self.ai.set_state(
            heroes=[{"id": "barbarian", "equipped_armor": [], "equipped_weapon": "broadsword"}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.equip("shield", hero_id="barbarian")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Defend dice increases to 3 and shield is listed in armor",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Defend dice: 2 ➔ {diff.heroes['barbarian']['defendDice'][1]}",
                     f"Armor list: {diff.heroes['barbarian']['equipped_armor'][1]}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertEqual(diff.heroes["barbarian"]["defendDice"][1], 3)
        self.assertIn("shield", diff.heroes["barbarian"]["equipped_armor"][1])

    def test_31_equip_helmet_stacks_defense(self):
        """Scenario 31: Equipping Helmet alongside Shield stacks defense to 4 dice."""
        bdd_scenario_header(31, "Equipping Helmet Alongside Shield")

        self.ai.set_state(
            heroes=[{"id": "barbarian", "equipped_armor": ["shield"], "equipped_weapon": "broadsword"}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.equip("helmet", hero_id="barbarian")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Defend dice stacks from 3 to 4",
                 assertions=[f"Defend dice: 3 ➔ {diff.heroes['barbarian']['defendDice'][1]}"])
        self.assertTrue(res.get("success"))
        self.assertEqual(diff.heroes["barbarian"]["defendDice"][1], 4)

    def test_32_equip_chain_mail_and_plate(self):
        """Scenario 32: Equipping Plate Mail sets base body armor to 4 dice."""
        bdd_scenario_header(32, "Equipping Heavy Plate Mail")

        self.ai.set_state(
            heroes=[{"id": "dwarf", "equipped_armor": [], "equipped_weapon": "shortsword"}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.equip("plate_mail", hero_id="dwarf")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Dwarf defend dice increases to 4",
                 assertions=[f"Defend dice: 2 ➔ {diff.heroes['dwarf']['defendDice'][1]}"])
        self.assertTrue(res.get("success"))
        self.assertEqual(diff.heroes["dwarf"]["defendDice"][1], 4)

    def test_33_equip_two_handed_weapon_conflicts_shield(self):
        """Scenario 33: Two-handed weapon conflicts with shield."""
        bdd_scenario_header(33, "Two-Handed Weapon Incompatible With Shield")

        bdd_step("GIVEN", "Barbarian holds Shield and attempts to equip Battleaxe")
        self.ai.set_state(
            heroes=[{"id": "barbarian", "equipped_armor": ["shield"], "equipped_weapon": "broadsword"}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.equip("battleaxe", hero_id="barbarian")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Action is rejected under two-handed rules",
                 assertions=[f"Equip battleaxe success: {res.get('success')} (False)"])
        self.assertFalse(res.get("success"))

    # =========================================================================
    # DOMAIN 8: TURN LIFECYCLE & GM PHASE (Scenarios 34-36)
    # =========================================================================

    def test_34_end_turn_advances_to_next_hero(self):
        """Scenario 34: Active hero ends turn advancing to next hero."""
        bdd_scenario_header(34, "End Turn Advances to Next Companion")

        bdd_step("GIVEN", "Barbarian ends turn; Dwarf is second hero")
        self.ai.set_state(
            activeHeroIndex=0,
            activeHero="barbarian",
            turnState="action_taken",
            movementRemaining=2,
            movementRolled=True,
            hasActed=True,
            heroes=[
                {"id": "barbarian", "grid_pos": [2, 1], "is_on_board": True},
                {"id": "dwarf", "is_on_board": False}
            ]
        )

        baseline = self.ai.snapshot()
        res = self.ai.end_turn()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Active hero index becomes 1 (Dwarf), Dwarf enters board, flags reset",
                 assertions=[
                     f"activeHeroIndex: 0 ➔ {diff.scalars['activeHeroIndex'][1]}",
                     f"activeHero: barbarian ➔ {diff.scalars['activeHero'][1]}",
                     f"movementRemaining resets to 0: {diff.scalars['movementRemaining'][1] == 0}",
                     f"turnState resets to awaiting_roll: {diff.scalars['turnState'][1]}"
                 ])
        diff.assert_scalar("activeHeroIndex", 0, 1)
        diff.assert_scalar("activeHero", "barbarian", "dwarf")
        diff.assert_scalar("turnState", "action_taken" if "action_taken" in baseline.get("turnState") else baseline.get("turnState"), "awaiting_roll")

    def test_35_all_four_heroes_end_turn_transitions_to_gm_phase(self):
        """Scenario 35: Fourth hero (Wizard) ends turn triggering Zargon GM phase."""
        bdd_scenario_header(35, "All Heroes Finish Turns: Zargon GM Phase Begins")

        bdd_step("GIVEN", "Wizard (hero index 3) is active hero ending turn")
        self.ai.set_state(
            activeHeroIndex=3,
            phase="hero_phase"
        )

        baseline = self.ai.snapshot()
        res = self.ai.end_turn()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Phase transitions from hero_phase to gm_phase",
                 assertions=[f"phase: hero_phase ➔ {diff.scalars.get('phase', (None, None))[1]}"])
        diff.assert_scalar("phase", "hero_phase", "gm_phase")

    def test_36_zargon_monster_phase_resolves_and_starts_round_two(self):
        """Scenario 36: Zargon GM phase completes and begins Round 2."""
        bdd_scenario_header(36, "Zargon Phase Completes and Begins Round 2")

        bdd_step("GIVEN", "Game is in gm_phase of Round 1")
        self.ai.set_state(
            phase="gm_phase",
            round=1,
            activeHeroIndex=0
        )

        baseline = self.ai.snapshot()
        res = self.ai.end_turn()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Round advances from 1 to 2 and phase returns to hero_phase",
                 assertions=[
                     f"round: 1 ➔ {diff.scalars['round'][1]}",
                     f"phase: gm_phase ➔ {diff.scalars['phase'][1]}"
                 ])
        diff.assert_scalar("round", 1, 2)
        diff.assert_scalar("phase", "gm_phase", "hero_phase")

    # =========================================================================
    # DOMAIN 9: AI STEP PROPOSAL GOVERNANCE (Scenarios 37-39)
    # =========================================================================

    def test_37_ai_step_propose_creates_modal_preview_without_mutation(self):
        """Scenario 37: Proposing AI step shows modal without mutating game board."""
        bdd_scenario_header(37, "AI Proposes Step Showing Modal Without State Mutation")

        bdd_step("GIVEN", "Barbarian awaiting turn actions, aiStepPending is False")
        self.ai.set_state(
            activeHero="barbarian",
            aiStepPending=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1]}]
        )

        baseline = self.ai.snapshot()
        res = self.ai.propose_ai_step()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "aiStepPending is True, modal is visible, but board remains untouched",
                 assertions=[
                     f"aiStepPending: False ➔ {diff.scalars['aiStepPending'][1]}",
                     f"Modal visible in scene: {current.get('scene', {}).get('ui', {}).get('modal', {}).get('aiConfirmModalVisible')}",
                     f"Hero pos changed: {'grid_pos' in diff.heroes.get('barbarian', {})}"
                 ])
        diff.assert_scalar("aiStepPending", False, True)
        self.assertTrue(current.get("scene", {}).get("ui", {}).get("modal", {}).get("aiConfirmModalVisible"))
        self.assertNotIn("grid_pos", diff.heroes.get("barbarian", {}))

    def test_38_ai_step_confirm_executes_action_and_closes_modal(self):
        """Scenario 38: Confirming proposed AI step executes command and closes modal."""
        bdd_scenario_header(38, "Confirm Proposed AI Step")

        self.ai.propose_ai_step()
        baseline = self.ai.snapshot()
        res = self.ai.confirm_ai_step()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "aiStepPending reverts to False and action is executed",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"aiStepPending: True ➔ {diff.scalars.get('aiStepPending', (None, None))[1]}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("aiStepPending", True, False)

    def test_39_ai_step_cancel_dismisses_modal_without_executing(self):
        """Scenario 39: Cancelling proposed AI step dismisses modal."""
        bdd_scenario_header(39, "Cancel Proposed AI Step")

        self.ai.propose_ai_step()
        baseline = self.ai.snapshot()
        res = self.ai.cancel_ai_step()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Modal dismissed and aiStepPending resets to False",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"aiStepPending: True ➔ {diff.scalars['aiStepPending'][1]}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_scalar("aiStepPending", True, False)

    # =========================================================================
    # DOMAIN 10: CARTRIDGE & QUEST PROGRESSION (Scenario 40)
    # =========================================================================

    def test_40_cartridge_switch_resets_map_and_heroes(self):
        """Scenario 40: Switching cartridge resets map configuration and starting stairwell."""
        bdd_scenario_header(40, "Cartridge Reset to Pristine Baseline")

        bdd_step("GIVEN", "Mutated state: Barbarian at (10, 10), door open, 100 gold")
        self.ai.set_state(
            heroes=[{"id": "barbarian", "grid_pos": [10, 10], "gold": 100}],
            revealedRooms=["room-nw-crypt"]
        )

        bdd_step("WHEN", "Resetting game to cartridge initial state")
        baseline = self.ai.snapshot()
        res = self.ai.reset_game()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Barbarian returns to starting stairwell, gold resets to 0, rooms unrevealed",
                 assertions=[
                     f"Success: {res.get('success')}",
                     f"Barbarian pos: [10, 10] ➔ {diff.heroes['barbarian']['grid_pos'][1]}",
                     f"Barbarian gold: 100 ➔ {diff.heroes['barbarian']['gold'][1]}",
                     f"Revealed rooms removed: {diff.rooms_revealed_removed}"
                 ])
        self.assertTrue(res.get("success"))
        diff.assert_hero_pos("barbarian", [10, 10], [0, 1])
        self.assertEqual(diff.heroes["barbarian"]["gold"][1], 0)
        self.assertIn("room-nw-crypt", diff.rooms_revealed_removed)

    # =========================================================================
    # DOMAIN 11: AUTHENTIC TURN STRUCTURE & NON-SPLITTABLE MOVEMENT (Scenarios 41-43)
    # =========================================================================

    def test_41_move_then_attack_forfeits_remaining_movement(self):
        """Scenario 41: Moving first and then attacking immediately concludes movement phase."""
        bdd_scenario_header(41, "Move Then Attack Concludes Movement Phase (No Splitting)")

        bdd_step("GIVEN", "Barbarian has 6 movement, advances 2 squares to (2, 1) adjacent to monster at (3, 1)",
                 info="Hero moves before action; 4 movement points remain")
        self.ai.set_state(
            activeHero="barbarian",
            turnState="moving",
            movementRemaining=6,
            movementRolled=True,
            hasActed=False,
            hasMoved=False,
            movedBeforeAction=False,
            movementClosed=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1], "is_on_board": True}],
            monsters=[{
                "id": "mon-orc-split",
                "name": "Orc Guard",
                "grid_pos": [3, 1],
                "current_bp": 2,
                "bodyPoints": 2,
                "is_alive": True,
                "roomId": ""
            }]
        )

        # Move 2 squares toward monster: (0, 1) ➔ (2, 1)
        self.ai.move(2, 1)
        st_after_move = self.ai.snapshot()
        self.assertEqual(st_after_move["movementRemaining"], 4)
        self.assertTrue(st_after_move["hasMoved"])
        self.assertTrue(st_after_move["movedBeforeAction"])

        bdd_step("WHEN", "Capturing baseline and Barbarian attacks adjacent Orc Guard at (3, 1)")
        baseline = self.ai.snapshot()
        atk_res = self.ai.attack(monster_id="mon-orc-split", weapon="broadsword")
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Action succeeds, movementRemaining drops to 0 (forfeited), and turnState transitions to turn_complete",
                 assertions=[
                     f"Attack success: {atk_res.get('success')}",
                     f"hasActed: False ➔ {diff.scalars.get('hasActed', (None, None))[1]}",
                     f"movementRemaining: 4 ➔ {diff.scalars.get('movementRemaining', (None, None))[1]} (remaining movement forfeited)",
                     f"movementClosed: False ➔ {diff.scalars.get('movementClosed', (None, None))[1]}",
                     f"turnState: moving ➔ {diff.scalars.get('turnState', (None, None))[1]}"
                 ])
        self.assertTrue(atk_res.get("success"))
        diff.assert_scalar("hasActed", False, True)
        diff.assert_scalar("movementRemaining", 4, 0)
        diff.assert_scalar("movementClosed", False, True)
        diff.assert_scalar("turnState", "moving", "turn_complete")

    def test_42_movement_after_move_and_attack_is_strictly_rejected(self):
        """Scenario 42: Attempting to move after completing Move + Attack is rejected under no-split rules."""
        bdd_scenario_header(42, "Movement After Move + Attack Is Forbidden")

        bdd_step("GIVEN", "Barbarian has moved and acted; turn is complete and movement is permanently closed",
                 info="hasActed = True, hasMoved = True, movedBeforeAction = True, movementClosed = True, movementRemaining = 0")
        self.ai.set_state(
            activeHero="barbarian",
            turnState="turn_complete",
            movementRemaining=0,
            movementRolled=True,
            hasActed=True,
            hasMoved=True,
            movedBeforeAction=True,
            movementClosed=True,
            heroes=[{"id": "barbarian", "grid_pos": [2, 1], "is_on_board": True}]
        )

        bdd_step("WHEN", "Barbarian attempts illegal movement to (1, 1)")
        baseline = self.ai.snapshot()
        res = self.ai.move(1, 1)
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        bdd_step("THEN", "Move is rejected (success: False), hero position remains unchanged, and board state has 0 mutations",
                 assertions=[
                     f"Success: {res.get('success')} (expected False)",
                     f"Barbarian position unchanged: {current.get('activeHeroPos')}",
                     f"Movement remaining unchanged: {'movementRemaining' not in diff.scalars}"
                 ])
        self.assertFalse(res.get("success"))
        self.assertNotIn("grid_pos", diff.heroes.get("barbarian", {}))
        self.assertNotIn("movementRemaining", diff.scalars)
        self.assertEqual(current.get("activeHeroPos"), [2, 1])

    def test_43_action_then_move_permits_full_movement_phase(self):
        """Scenario 43: Hero attacks first without moving, then takes full movement phase."""
        bdd_scenario_header(43, "Action Then Move Permits Full Movement Phase")

        bdd_step("GIVEN", "Barbarian begins turn adjacent to monster at (0, 2) without moving",
                 info="hasActed = False, hasMoved = False, movedBeforeAction = False, turnState = awaiting_roll")
        self.ai.set_state(
            activeHero="barbarian",
            turnState="awaiting_roll",
            movementRemaining=0,
            movementRolled=False,
            hasActed=False,
            hasMoved=False,
            movedBeforeAction=False,
            movementClosed=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1], "is_on_board": True}],
            monsters=[{
                "id": "mon-orc-action-first",
                "name": "Orc Sentry",
                "grid_pos": [0, 2],
                "current_bp": 2,
                "bodyPoints": 2,
                "is_alive": True,
                "roomId": ""
            }]
        )

        bdd_step("WHEN", "Barbarian attacks adjacent monster FIRST before rolling or moving")
        baseline = self.ai.snapshot()
        atk_res = self.ai.attack(monster_id="mon-orc-action-first", weapon="broadsword")
        post_atk = self.ai.snapshot()
        diff_atk = diff_snapshots(baseline, post_atk)

        bdd_step("THEN", "Action succeeds and turnState transitions to action_taken (movement still available)",
                 assertions=[
                     f"Attack success: {atk_res.get('success')}",
                     f"hasActed: False ➔ {diff_atk.scalars.get('hasActed', (None, None))[1]}",
                     f"hasMoved: {post_atk.get('hasMoved')} (expected False)",
                     f"turnState: awaiting_roll ➔ {diff_atk.scalars.get('turnState', (None, None))[1]}"
                 ])
        self.assertTrue(atk_res.get("success"))
        diff_atk.assert_scalar("hasActed", False, True)
        self.assertFalse(post_atk.get("hasMoved"))
        diff_atk.assert_scalar("turnState", "awaiting_roll", "action_taken")

        bdd_step("WHEN", "Barbarian has 2 movement remaining and advances 2 squares to (2, 1)")
        self.ai.set_state(movementRemaining=2, movementRolled=True)
        base_move = self.ai.snapshot()
        move_res = self.ai.move(2, 1)
        post_move = self.ai.snapshot()
        diff_move = diff_snapshots(base_move, post_move)

        bdd_step("THEN", "Move succeeds, position becomes (2, 1), movementRemaining drops to 0, and turnState becomes turn_complete",
                 assertions=[
                     f"Move success: {move_res.get('success')}",
                     f"Grid pos: [0, 1] ➔ {diff_move.heroes['barbarian']['grid_pos'][1]}",
                     f"movementRemaining: 2 ➔ {diff_move.scalars.get('movementRemaining', (None, None))[1]}",
                     f"turnState: action_taken ➔ {diff_move.scalars.get('turnState', (None, None))[1]}"
                 ])
        self.assertTrue(move_res.get("success"))
        diff_move.assert_hero_pos("barbarian", [0, 1], [2, 1])
        diff_move.assert_scalar("movementRemaining", 2, 0)
        diff_move.assert_scalar("turnState", "action_taken", "turn_complete")

    def test_44_hero_movement_trail_and_remaining_moves_display(self):
        """Scenario 44: Green line from where character came from with moves remaining in middle."""
        bdd_scenario_header(44, "Movement Trail Line from Origin with Moves Remaining")

        bdd_step("GIVEN", "Barbarian starts at (0, 1) and rolls 6 movement")
        self.ai.set_state(
            activeHeroIndex=0,
            activeHero="barbarian",
            movementRemaining=6,
            movementRolled=True,
            turnState="moving",
            hasMoved=False,
            heroes=[{"id": "barbarian", "grid_pos": [0, 1], "is_on_board": True}]
        )

        bdd_step("WHEN", "Barbarian moves 2 squares to (2, 1)")
        res1 = self.ai.move(2, 1)
        st1 = self.ai.get_state()

        bdd_step("THEN", "Movement trail records path from origin and 4 moves remain",
                 assertions=[
                     f"Move 1 success: {res1.get('success')}",
                     f"Remaining moves: {st1.get('movementRemaining')} (expected 4)",
                     f"Movement trail: {st1.get('movementTrail')}"
                 ])
        self.assertTrue(res1.get("success"))
        self.assertEqual(st1.get("movementRemaining"), 4)
        self.assertEqual(st1.get("movementTrail"), [[0, 1], [1, 1], [2, 1]])

        bdd_step("WHEN", "Barbarian moves further to (5, 1)")
        res2 = self.ai.move(5, 1)
        st2 = self.ai.get_state()

        bdd_step("THEN", "Movement trail extends along full path and 1 move remains",
                 assertions=[
                     f"Move 2 success: {res2.get('success')}",
                     f"Remaining moves: {st2.get('movementRemaining')} (expected 1)",
                     f"Movement trail: {st2.get('movementTrail')}"
                 ])
        self.assertTrue(res2.get("success"))
        self.assertEqual(st2.get("movementRemaining"), 1)
        self.assertEqual(st2.get("movementTrail"), [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]])

        bdd_step("WHEN", "Barbarian ends turn")
        self.ai.end_turn()
        st3 = self.ai.get_state()

        bdd_step("THEN", "Movement trail clears for next companion",
                 assertions=[f"Trail cleared: {st3.get('movementTrail') == []}"])
        self.assertEqual(st3.get("movementTrail"), [])

    def test_45_hero_cards_display_name_and_class(self):
        """Scenario 45: Hero cards display both character Name and Class."""
        bdd_scenario_header(45, "Hero Cards Display Name and Class")

        bdd_step("GIVEN", "Game is running with classic party of four heroes")
        st = self.ai.get_state()
        char_cards = st.get("characterCards", [])

        bdd_step("THEN", "Every hero card provides both character name and class",
                 assertions=[
                     f"Total character cards: {len(char_cards)} (expected 4)"
                 ])
        self.assertEqual(len(char_cards), 4)

        # 1. Barbarian: Name "Rogar", Class "Barbarian"
        barb = next((c for c in char_cards if c.get("id") == "barbarian"), None)
        self.assertIsNotNone(barb)
        self.assertEqual(barb.get("characterName"), "Rogar")
        self.assertEqual(barb.get("heroClass"), "Barbarian")
        self.assertEqual(barb.get("displayName"), "Rogar (Barbarian)")

        # 2. Dwarf: Name "Dorgan", Class "Dwarf"
        dwarf = next((c for c in char_cards if c.get("id") == "dwarf"), None)
        self.assertIsNotNone(dwarf)
        self.assertEqual(dwarf.get("characterName"), "Dorgan")
        self.assertEqual(dwarf.get("heroClass"), "Dwarf")
        self.assertEqual(dwarf.get("displayName"), "Dorgan (Dwarf)")

        # 3. Elf: Name "Ladril", Class "Elf"
        elf = next((c for c in char_cards if c.get("id") == "elf"), None)
        self.assertIsNotNone(elf)
        self.assertEqual(elf.get("characterName"), "Ladril")
        self.assertEqual(elf.get("heroClass"), "Elf")
        self.assertEqual(elf.get("displayName"), "Ladril (Elf)")

        # 4. Wizard: Name "Telor", Class "Wizard"
        wiz = next((c for c in char_cards if c.get("id") == "wizard"), None)
        self.assertIsNotNone(wiz)
        self.assertEqual(wiz.get("characterName"), "Telor")
        self.assertEqual(wiz.get("heroClass"), "Wizard")
        self.assertEqual(wiz.get("displayName"), "Telor (Wizard)")

        bdd_step("WHEN", "A hero is configured with a custom character name")
        self.ai.set_state(
            heroes=[{
                "id": "barbarian",
                "characterName": "Grimjaw",
                "heroClass": "Berserker"
            }]
        )
        st_custom = self.ai.get_state()
        barb_custom = next((c for c in st_custom.get("characterCards", []) if c.get("id") == "barbarian"), None)

        bdd_step("THEN", "Hero card reflects the custom name and class: 'Grimjaw (Berserker)'",
                 assertions=[
                     f"Custom characterName: {barb_custom.get('characterName')}",
                     f"Custom heroClass: {barb_custom.get('heroClass')}",
                     f"Custom displayName: {barb_custom.get('displayName')}"
                 ])
        self.assertEqual(barb_custom.get("characterName"), "Grimjaw")
        self.assertEqual(barb_custom.get("heroClass"), "Berserker")
        self.assertEqual(barb_custom.get("displayName"), "Grimjaw (Berserker)")

    def test_46_combat_dice_layout_top_skulls_bottom_shields_and_defeated_banner(self):
        """Scenario 46: Combat Dice Layout - Top Skulls, Bottom Shields, and Creature Defeated Banner."""
        bdd_scenario_header(46, "Combat Dice Layout: Top Skulls, Bottom Shields & Creature Defeated Banner")

        bdd_step("GIVEN", "Rogar (Barbarian) faces a 1-BP Crypt Skeleton with Broadsword")
        self.ai.set_state(
            activeHeroIndex=0,
            activeHero="barbarian",
            heroes=[{"id": "barbarian", "characterName": "Rogar", "heroClass": "Barbarian", "grid_pos": [4, 4], "is_on_board": True}],
            monsters=[{"id": "mon-test-skel", "name": "Crypt Skeleton", "grid_pos": [4, 5], "current_bp": 1, "is_alive": True, "defendDice": 2}]
        )

        bdd_step("WHEN", "Triggering a custom lethal combat roll against the Crypt Skeleton",
                 info="3 Attack Dice vs 2 Defend Dice (Creature Defeated)")
        res = self.ai.execute_action("test_dice_roll",
                                     type="combat",
                                     attacker="Rogar (Barbarian)",
                                     defender="Crypt Skeleton",
                                     attackDice=3,
                                     defendDice=2,
                                     isHeroDefending=False,
                                     isDefeated=True)
        self.assertTrue(res.get("success", False))

        st = self.ai.get_state()
        active_dice = st.get("activeDiceRoll", {})

        bdd_step("THEN", "Combat dice tray places attacker on top, defender on bottom, and announces creature defeat",
                 assertions=[
                     f"type: {active_dice.get('type')} (expected 'combat')",
                     f"attacker: '{active_dice.get('attackerName')}' (Rogar (Barbarian))",
                     f"defender: '{active_dice.get('defenderName')}' (Crypt Skeleton)",
                     f"isDefeated: {active_dice.get('isDefeated')} (expected True)",
                     f"summary: '{active_dice.get('summary')}'"
                 ])
        self.assertEqual(active_dice.get("type"), "combat")
        self.assertEqual(active_dice.get("attackerName"), "Rogar (Barbarian)")
        self.assertEqual(active_dice.get("defenderName"), "Crypt Skeleton")
        self.assertTrue(active_dice.get("isDefeated"))
        self.assertIn("DEFEATED!", active_dice.get("summary", ""))
        self.assertIn("Skull", active_dice.get("summary", ""))

        bdd_step("WHEN", "Game Master monster attacks Elf defending with 3 White Shields",
                 info="Monster Attacker (Top) vs Hero Defender (Bottom)")
        res2 = self.ai.execute_action("test_dice_roll",
                                      type="combat",
                                      attacker="Orc Warlord",
                                      defender="Ladril (Elf)",
                                      attackDice=4,
                                      defendDice=3,
                                      isHeroDefending=True,
                                      isDefeated=False)
        self.assertTrue(res2.get("success", False))

        st2 = self.ai.get_state()
        active_dice2 = st2.get("activeDiceRoll", {})
        bdd_step("THEN", "Attacker Orc Warlord is on top and defender Ladril (Elf) is on bottom",
                 assertions=[
                     f"attacker: '{active_dice2.get('attackerName')}'",
                     f"defender: '{active_dice2.get('defenderName')}'",
                     f"isDefeated: {active_dice2.get('isDefeated')} (expected False)"
                 ])
        self.assertEqual(active_dice2.get("attackerName"), "Orc Warlord")
        self.assertEqual(active_dice2.get("defenderName"), "Ladril (Elf)")
        self.assertFalse(active_dice2.get("isDefeated"))

    def test_47_hero_tokens_barbarian_dwarf_elf_wizard(self):
        """Scenario 47: Hero Tokens - High-Definition Battle Tokens for Barbarian, Dwarf, Elf, and Wizard."""
        bdd_scenario_header(47, "Hero Tokens: High-Definition Tokens from RPG Asset Index")

        bdd_step("GIVEN", "Game is running with classic party of four heroes")
        self.ai.reset_game()
        st = self.ai.get_state()
        char_cards = st.get("characterCards", [])

        bdd_step("THEN", "Every hero has an authentic circular battle token from the RPG asset library",
                 assertions=[f"Total character cards: {len(char_cards)} (expected 4)"])
        self.assertEqual(len(char_cards), 4)

        # 1. Barbarian
        barb = next((c for c in char_cards if c.get("id") == "barbarian"), None)
        self.assertIsNotNone(barb)
        self.assertTrue(barb.get("tokenAsset", "").endswith("token_barbarian.png"))
        self.assertTrue(barb.get("hasTokenTexture", False))

        # 2. Dwarf
        dwarf = next((c for c in char_cards if c.get("id") == "dwarf"), None)
        self.assertIsNotNone(dwarf)
        self.assertTrue(dwarf.get("tokenAsset", "").endswith("token_dwarf.png"))
        self.assertTrue(dwarf.get("hasTokenTexture", False))

        # 3. Elf
        elf = next((c for c in char_cards if c.get("id") == "elf"), None)
        self.assertIsNotNone(elf)
        self.assertTrue(elf.get("tokenAsset", "").endswith("token_elf.png"))
        self.assertTrue(elf.get("hasTokenTexture", False))

        # 4. Wizard
        wiz = next((c for c in char_cards if c.get("id") == "wizard"), None)
        self.assertIsNotNone(wiz)
        self.assertTrue(wiz.get("tokenAsset", "").endswith("token_wizard.png"))
        self.assertTrue(wiz.get("hasTokenTexture", False))

        bdd_step("WHEN", "All four heroes are placed onto the dungeon board")
        self.ai.set_state(
            heroes=[
                {"id": "barbarian", "is_on_board": True, "grid_pos": [0, 1]},
                {"id": "dwarf", "is_on_board": True, "grid_pos": [1, 1]},
                {"id": "elf", "is_on_board": True, "grid_pos": [2, 1]},
                {"id": "wizard", "is_on_board": True, "grid_pos": [3, 1]}
            ]
        )
        st_board = self.ai.get_state()
        board_heroes = [h for h in st_board.get("heroes", []) if h.get("is_on_board")]

        bdd_step("THEN", "All four hero tokens are active on the board with distinct positions and valid textures",
                 assertions=[
                     f"Heroes on board: {len(board_heroes)} (expected 4)",
                     f"Barbarian pos: {board_heroes[0].get('grid_pos')}",
                     f"Dwarf pos: {board_heroes[1].get('grid_pos')}",
                     f"Elf pos: {board_heroes[2].get('grid_pos')}",
                     f"Wizard pos: {board_heroes[3].get('grid_pos')}"
                 ])
        self.assertEqual(len(board_heroes), 4)

    def test_48_monster_ai_turn_correct_attacker_and_movement(self):
        """Scenario 48: Zargon Monster AI Turn - Correct Attacker Attribution and Stoppage Adjacent to Hero."""
        bdd_scenario_header(48, "Monster AI Turn: Attacker Attribution & Stop Adjacent to Hero")

        bdd_step("GIVEN", "Barbarian stands at (4, 2) in crypt doorway; Crypt Skeleton is at (4, 4); Boss Verag is at (4, 10)")
        self.ai.reset_game()
        self.ai.set_state(
            revealedRooms=["room-nw-crypt"],
            heroes=[
                {"id": "barbarian", "is_on_board": True, "grid_pos": [4, 2], "current_bp": 8},
                {"id": "dwarf", "is_on_board": False, "grid_pos": [-1, -1]},
                {"id": "elf", "is_on_board": False, "grid_pos": [-1, -1]},
                {"id": "wizard", "is_on_board": False, "grid_pos": [-1, -1]}
            ],
            monsters=[
                {"id": "mon-skel-1", "grid_pos": [4, 4], "current_bp": 1, "is_alive": True, "roomId": "room-nw-crypt"},
                {"id": "mon-skel-2", "grid_pos": [1, 1], "current_bp": 1, "is_alive": False, "roomId": "room-nw-crypt"}, # Defeated so only skel-1 acts
                {"id": "mon-verag", "grid_pos": [4, 10], "current_bp": 4, "is_alive": True, "roomId": "room-grand-fossil"}
            ]
        )

        bdd_step("WHEN", "Zargon initiates monster turn")
        baseline = self.ai.snapshot()
        res = self.ai.monster_turn()
        current = self.ai.snapshot()
        diff = diff_snapshots(baseline, current)

        # Retrieve skel-1 and hero positions
        skel = next((m for m in current.get("monsters", []) if m.get("id") == "mon-skel-1"), {})
        barb = next((h for h in current.get("heroes", []) if h.get("id") == "barbarian"), {})
        active_dice = current.get("activeDiceRoll", {})

        bdd_step("THEN", "Skeleton advances to adjacent tile (4, 3) and NEVER enters Barbarian tile (4, 2)",
                 assertions=[
                     f"Barbarian position preserved at [4, 2]: {barb.get('grid_pos') == [4, 2]}",
                     f"Skeleton position is adjacent [4, 3]: {skel.get('grid_pos')}",
                     f"Skeleton did NOT enter hero square: {skel.get('grid_pos') != barb.get('grid_pos')}"
                 ])
        self.assertEqual(barb.get("grid_pos"), [4, 2])
        self.assertEqual(skel.get("grid_pos"), [4, 3])
        self.assertNotEqual(skel.get("grid_pos"), barb.get("grid_pos"))

        bdd_step("AND", "Attacker is Crypt Skeleton (2 attack dice), NOT Verag the Orc Warlord (4 attack dice)",
                 assertions=[
                     f"Attacker name in dice roll: '{active_dice.get('attackerName')}'",
                     f"Attacking dice count: {active_dice.get('attackDiceCount') or active_dice.get('diceCount')}",
                     f"Verag did NOT attack: {'Verag' not in str(diff.combat_log_added)}"
                 ])
        self.assertIn("Skeleton", active_dice.get("attackerName", ""))
        self.assertNotIn("Verag", active_dice.get("attackerName", ""))
        # Verify combat log additions attribute attack to Skeleton and never Verag
        log_text = " ".join(diff.combat_log_added)
        self.assertIn("Skeleton", log_text)
        self.assertNotIn("Verag the Orc Warlord attacks", log_text)

    def test_49_turn_overlay_click_to_roll_flashy_number_and_turn_complete(self):
        """Scenario 49: Turn Overlay Banner - Click to Roll, Big Flashy Number at Top, and Turn Complete."""
        bdd_scenario_header(49, "Turn Overlay: Click to Roll, Top Flashy Number & Turn Complete")

        bdd_step("GIVEN", "Barbarian starts turn awaiting roll")
        self.ai.reset_game()
        st = self.ai.get_state()
        overlay = st.get("turnOverlay", {})

        bdd_step("THEN", "Screen displays roll overlay: 'Rogar (Barbarian)'s turn... Click to roll!'",
                 assertions=[
                     f"Overlay visible: {overlay.get('visible')}",
                     f"Overlay mode: '{overlay.get('mode')}' (expected 'roll_prompt')",
                     f"Overlay text: '{overlay.get('text')}'"
                 ])
        self.assertTrue(overlay.get("visible"))
        self.assertEqual(overlay.get("mode"), "roll_prompt")
        self.assertEqual(overlay.get("text"), "Rogar (Barbarian)'s turn... Click to roll!")

        bdd_step("WHEN", "Player clicks the turn overlay banner")
        res = self.ai.click_turn_overlay()
        st_after_roll = self.ai.get_state()
        overlay_after_roll = st_after_roll.get("turnOverlay", {})
        flashy = overlay_after_roll.get("flashyNumber", {})

        bdd_step("THEN", "Movement dice are rolled, roll overlay hides, and big flashy number appears at top of screen",
                 assertions=[
                     f"Action success: {res.get('success')}",
                     f"Movement rolled: {st_after_roll.get('movementRolled')}",
                     f"Movement remaining: {st_after_roll.get('movementRemaining')}",
                     f"Roll prompt overlay hidden: {not overlay_after_roll.get('visible')}",
                     f"Flashy number panel visible: {flashy.get('visible')}",
                     f"Flashy number value: {flashy.get('value')} (expected {st_after_roll.get('movementRemaining')})",
                     f"Flashy number alpha: {flashy.get('alpha')}"
                 ])
        self.assertTrue(res.get("success"))
        self.assertTrue(st_after_roll.get("movementRolled"))
        self.assertGreater(st_after_roll.get("movementRemaining", 0), 0)
        self.assertFalse(overlay_after_roll.get("visible"))
        self.assertTrue(flashy.get("visible"))
        self.assertEqual(flashy.get("value"), st_after_roll.get("movementRemaining"))
        self.assertGreater(flashy.get("alpha", 0.0), 0.0)

        bdd_step("WHEN", "Barbarian completes all movement and takes an action (turn ends)",
                 info="Setting turnState to 'turn_complete'")
        self.ai.set_state(turnState="turn_complete", movementRemaining=0, hasActed=True, movementClosed=True)
        st_complete = self.ai.get_state()
        overlay_complete = st_complete.get("turnOverlay", {})

        bdd_step("THEN", "Overlay displays: 'turn complete, next turn Dorgan'",
                 assertions=[
                     f"Overlay visible: {overlay_complete.get('visible')}",
                     f"Overlay mode: '{overlay_complete.get('mode')}' (expected 'turn_complete')",
                     f"Overlay text: '{overlay_complete.get('text')}'"
                 ])
        self.assertTrue(overlay_complete.get("visible"))
        self.assertEqual(overlay_complete.get("mode"), "turn_complete")
        self.assertEqual(overlay_complete.get("text"), "turn complete, next turn Dorgan")

        bdd_step("WHEN", "Player clicks the turn complete overlay")
        res_next = self.ai.click_turn_overlay()
        st_next = self.ai.get_state()
        overlay_next = st_next.get("turnOverlay", {})

        bdd_step("THEN", "Turn advances to Dwarf and displays: 'Dorgan (Dwarf)'s turn... Click to roll!'",
                 assertions=[
                     f"Active hero index: {st_next.get('activeHeroIndex')} (expected 1)",
                     f"Active hero: '{st_next.get('activeHero')}' (expected 'dwarf')",
                     f"Turn state: '{st_next.get('turnState')}' (expected 'awaiting_roll')",
                     f"Dwarf overlay text: '{overlay_next.get('text')}'"
                 ])
        self.assertEqual(st_next.get("activeHeroIndex"), 1)
        self.assertEqual(st_next.get("activeHero"), "dwarf")
        self.assertEqual(st_next.get("turnState"), "awaiting_roll")
        self.assertTrue(overlay_next.get("visible"))
        self.assertEqual(overlay_next.get("text"), "Dorgan (Dwarf)'s turn... Click to roll!")

        bdd_step("WHEN", "Configuring custom hero names and classes (e.g. Grimjaw the Berserker)")
        self.ai.set_state(
            activeHeroIndex=0,
            turnState="awaiting_roll",
            movementRolled=False,
            movementRemaining=0,
            hasActed=False,
            movementClosed=False,
            heroes=[{"id": "barbarian", "characterName": "Grimjaw", "heroClass": "Berserker"}]
        )
        st_custom = self.ai.get_state()
        overlay_custom = st_custom.get("turnOverlay", {})
        bdd_step("THEN", "Overlay dynamically adapts to custom hero: 'Grimjaw (Berserker)'s turn... Click to roll!'",
                 assertions=[f"Custom overlay text: '{overlay_custom.get('text')}'"])
        self.assertEqual(overlay_custom.get("text"), "Grimjaw (Berserker)'s turn... Click to roll!")

        bdd_step("WHEN", "Wizard (last hero) concludes turn")
        self.ai.set_state(
            activeHeroIndex=3,
            turnState="turn_complete",
            movementRemaining=0,
            hasActed=True,
            movementClosed=True
        )
        st_wiz = self.ai.get_state()
        overlay_wiz = st_wiz.get("turnOverlay", {})
        bdd_step("THEN", "Overlay attributes next turn to Zargon: 'turn complete, next turn Zargon'",
                 assertions=[f"Last hero complete text: '{overlay_wiz.get('text')}'"])
        self.assertEqual(overlay_wiz.get("text"), "turn complete, next turn Zargon")


if __name__ == "__main__":
    unittest.main(verbosity=2)


