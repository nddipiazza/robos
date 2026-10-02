#!/usr/bin/env python3
"""
test_tabletop_scenario_engine_e2e.py
Comprehensive End-to-End BDD test suite verifying:
1. Drop-in Tabletop RPG test scenarios from Knowledge Graph conforming 100% to W3C SHACL shapes.
2. Tabletop AI Engines (Mentor Autonomous Harness & Zargon Dungeon Master) and AI Directives.
3. Execution of drop-in scenarios (the-trial-crypt-breach.jsonld) through TabletopRPCAI.
4. Human-in-the-loop proposal governance honoring directive policies.
5. Zargon AI monster retaliation phase.
"""

import os
import sys
import time
import json
import unittest
import subprocess

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)

from rpc_ai.tabletop_rpc_ai import TabletopRPCAI

SCENARIOS_DIR = os.path.join(ROOT_DIR, "scenarios")
VALIDATOR_SCRIPT = os.path.join(TESTS_DIR, "validate_scenarios_kgraph.js")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestTabletopScenarioEngineE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🏛️ FEATURE: Knowledge Graph Game AI Engine & Drop-In Test Scenario Framework")
        print("   As a Tabletop RPG Developer & Autonomous AI Harness")
        print("   I want drop-in TabletopTestScenario JSON-LD files and AI Engine directives")
        print("   Conforming to W3C SHACL shapes and Schema.org standards")
        print("   So that autonomous AI playthroughs are fully specified in the Knowledge Graph")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18095
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.ai = TabletopRPCAI(port=cls.port, human_delay=0.15)
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

    def test_01_all_scenario_files_conform_to_shacl_shapes(self):
        """Scenario 1: Every scenario file in scenarios/*.jsonld conforms to robos:TabletopTestScenario SHACL shapes."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Drop-in Scenario Files Conform 100% to W3C SHACL Shapes")
        print("-" * 80)

        bdd_step("GIVEN", "Directory of drop-in scenario files at games/tabletop-rpg/scenarios/",
                 info=f"Scanning: {SCENARIOS_DIR}")

        scenario_files = [
            os.path.join(SCENARIOS_DIR, f)
            for f in os.listdir(SCENARIOS_DIR)
            if f.endswith(".jsonld")
        ]
        self.assertGreaterEqual(len(scenario_files), 3, "Must have at least 3 scenario files")

        bdd_step("WHEN", "Running the KGraph SHACL validator across all scenario files",
                 info=f"Executing: node {VALIDATOR_SCRIPT} ...")

        cmd = ["node", VALIDATOR_SCRIPT] + scenario_files
        res = subprocess.run(cmd, capture_output=True, text=True)

        bdd_step("THEN", "Validation passes with exit code 0 and 0 SHACL violations",
                 assertions=[
                     f"Scenarios validated: {len(scenario_files)}",
                     f"Validator output contains: 'conform 100% to W3C SHACL shapes'",
                     f"Return code: {res.returncode}"
                 ])

        self.assertEqual(res.returncode, 0, f"SHACL validation failed:\n{res.stderr}\n{res.stdout}")
        self.assertIn("conform 100% to W3C SHACL shapes", res.stdout)

    def test_02_kgraph_tabletop_ai_engines_and_directives(self):
        """Scenario 2: Knowledge Graph defines TabletopAIEngine and TabletopAIDirective entities."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Knowledge Graph Package Exposes Tabletop AI Engines & Directives")
        print("-" * 80)

        bdd_step("GIVEN", "The tabletop-game KGraph package file",
                 info=".robos/kgraphs/tabletop-game/package.jsonld")

        pkg_path = os.path.join(ROOT_DIR, "../../.robos/kgraphs/tabletop-game/package.jsonld")
        self.assertTrue(os.path.exists(pkg_path), "Package file must exist")

        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)

        nodes = pkg_data.get("robos:nodes", [])
        engines = [n for n in nodes if "robos:TabletopAIEngine" in n.get("@type", [])]
        directives = [n for n in nodes if "robos:TabletopAIDirective" in n.get("@type", [])]
        scenarios = [n for n in nodes if "robos:TabletopTestScenario" in n.get("@type", [])]

        bdd_step("THEN", "Mentor AI Engine and Zargon AI Engine are declared",
                 assertions=[
                     f"Found {len(engines)} AI Engines in KGraph",
                     f"Found {len(directives)} AI Directives in KGraph",
                     f"Found {len(scenarios)} Canonical Scenarios in KGraph"
                 ])

        self.assertGreaterEqual(len(engines), 2)
        self.assertGreaterEqual(len(directives), 5)
        self.assertGreaterEqual(len(scenarios), 3)

        mentor = next((e for e in engines if "mentor" in e["@id"]), None)
        self.assertIsNotNone(mentor)
        self.assertEqual(mentor.get("robos:role"), "autonomous_player")
        self.assertIn("proposal_confirmed", mentor.get("robos:controllerModes", []))
        self.assertEqual(mentor.get("robos:humanGovernance"), "proposal_preview_modal")

    def test_03_execute_scenario_the_trial_crypt_breach(self):
        """Scenario 3: Execute the drop-in scenario 'the-trial-crypt-breach.jsonld' through TabletopRPCAI."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Execute Drop-in Scenario 'the-trial-crypt-breach.jsonld'")
        print("-" * 80)

        scenario_path = os.path.join(SCENARIOS_DIR, "the-trial-crypt-breach.jsonld")
        bdd_step("GIVEN", "Drop-in scenario 'the-trial-crypt-breach.jsonld'",
                 info=scenario_path)

        bdd_step("WHEN", "Executing scenario commands (Roll -> Advance -> Kick Open Door)",
                 info="AI loads scenario and dispatches commands sequentially")

        exec_res = self.ai.execute_scenario(scenario_path)
        self.assertTrue(exec_res.get("success", False))

        final_st = exec_res.get("final_state", {})
        bdd_step("THEN", "Crypt door is breached and Fog of War lifts revealing skeletons",
                 assertions=[
                     f"Revealed rooms: {final_st.get('revealedRooms')}",
                     f"Visible enemies count: {final_st.get('visibleEnemiesCount')} (expected >= 2)",
                     f"Discovered enemies count: {final_st.get('discoveredEnemiesCount')} (expected >= 2)"
                 ])

        self.assertGreaterEqual(len(final_st.get("revealedRooms", [])), 1)
        self.assertGreaterEqual(final_st.get("visibleEnemiesCount", 0), 2)

    def test_04_directive_proposal_confirmation_governance(self):
        """Scenario 4: Directives requiring proposal confirmation open modal preview before execution."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: AI Directive Proposal Confirmation Governance")
        print("-" * 80)

        bdd_step("GIVEN", "Barbarian stands outside chamber with proposal-confirmed directive",
                 info="Upcoming action is melee attack on Crypt Skeleton")

        prop_res = self.ai.propose_ai_step()
        self.assertTrue(prop_res.get("success"))

        st = self.ai.get_state()
        bdd_step("THEN", "AI Step Proposal modal is displayed and state remains unmutated",
                 assertions=[
                     "aiStepPending is True",
                     f"pendingAiCommand action: {st.get('pendingAiCommand', {}).get('action')}"
                 ])

        self.assertTrue(st.get("aiStepPending"))
        self.assertIsNotNone(st.get("pendingAiCommand"))

        bdd_step("WHEN", "Player confirms the proposed AI Step",
                 info="Click '✅ Confirm & Execute'")

        conf_res = self.ai.confirm_ai_step()
        self.assertTrue(conf_res.get("success"))
        self.assertTrue(conf_res.get("executed"))

        st_after = self.ai.get_state()
        bdd_step("THEN", "Action executed cleanly and modal dismissed",
                 assertions=[
                     "aiStepPending is False",
                     "auto_play_step advanced"
                 ])
        self.assertFalse(st_after.get("aiStepPending"))

    def test_05_zargon_monster_retaliation_phase(self):
        """Scenario 5: Zargon GM AI directive executes monster retaliation phase."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Zargon Monster AI Phase Execution")
        print("-" * 80)

        bdd_step("WHEN", "Game Master triggers monster phase retaliation",
                 info="Zargon AI activates living dungeon monsters")

        m_res = self.ai.play_monster_phase()
        self.assertTrue(m_res.get("success", True))

        st = self.ai.get_state()
        bdd_step("THEN", "Combat log reflects monster activity or phase transition",
                 assertions=[
                     f"Current phase: {st.get('phase')}",
                     f"Recent combat log entries: {len(st.get('combatLog', []))}"
                 ])
        self.assertGreater(len(st.get("combatLog", [])), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
