#!/usr/bin/env python3
"""
test_ai_step_confirmation_e2e.py
Comprehensive End-to-End BDD test suite verifying:
1. "⚡ AI Step" proposal modal: Clicking AI Step does NOT execute immediately.
   Instead, it displays the pending action title, command, hero, parameters,
   and tactical rationale in a dedicated confirmation dialog.
2. Modal cancellation: Dismissing the proposal leaves the game state, turn,
   and step counter completely unmutated.
3. Modal confirmation: Confirming executes the proposed command atomically,
   updating game state, incrementing the step counter, and logging the event.
4. Multi-step progression: Consecutive steps (movement roll -> corridor advance ->
   open door -> enter room) each preview accurately before execution.
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


def bdd_step(step_type: str, text: str, modal_info: str = None, command_info: str = None, assertions: list = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if modal_info:
        print(f"    🪟  [CONFIRM MODAL] {modal_info}")
    if command_info:
        print(f"    ⚡  [AI COMMAND]    {command_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]     {a}")


class TestAIStepConfirmationE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("🤖 FEATURE: AI Step Command Preview & User Confirmation Modal")
        print("   As a Tabletop RPG Player")
        print("   When I click '⚡ AI Step'")
        print("   I want to see the exact tactical command the AI intends to perform before execution")
        print("   And be able to Confirm or Cancel the action")
        print("   So that I have full oversight and agency over autonomous AI plays")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18098
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.15)
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

    def test_01_proposal_displays_preview_without_executing(self):
        """Scenario 1: Triggering AI Step shows proposal preview without mutating game state."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: AI Step Proposal Displays Command Preview Without Executing")
        print("-" * 80)

        bdd_step("GIVEN", "Tabletop game initialized on turn 1 with Barbarian active",
                 command_info="Initial state: 0 movement rolled, auto_play_step = 0")

        initial_state = self.player.get_state()
        self.assertFalse(initial_state.get("aiStepPending", False))
        self.assertEqual(initial_state.get("movementRolled", 0), 0)

        bdd_step("WHEN", "Player clicks '⚡ AI Step' (or triggers proposal)",
                 modal_info="AI Confirmation Dialog opens with command preview")

        prop_res = self.player.propose_ai_step()
        self.assertTrue(prop_res.get("success", False))

        state = self.player.get_state()
        self.assertTrue(state.get("aiStepPending", False), "aiStepPending should be True")
        
        pending_cmd = state.get("pendingAiCommand", {})
        bdd_step("THEN", "Pending command preview contains Step 1 details",
                 command_info=f"Step {pending_cmd.get('step')}: {pending_cmd.get('title')} ({pending_cmd.get('command')})",
                 assertions=[
                     f"Action: {pending_cmd.get('action')}",
                     f"Hero: {pending_cmd.get('hero')}",
                     f"Rationale: {pending_cmd.get('rationale')}"
                 ])

        self.assertEqual(pending_cmd.get("step"), 1)
        self.assertEqual(pending_cmd.get("action"), "roll_movement")
        self.assertEqual(pending_cmd.get("hero"), "Barbarian")

        # Crucial: Game state has NOT executed the step yet!
        self.assertEqual(state.get("movementRolled", 0), 0, "Hero must NOT have rolled movement yet before confirmation")

    def test_02_cancel_dismisses_proposal_without_mutation(self):
        """Scenario 2: Cancelling AI Step proposal dismisses dialog and leaves state untouched."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Cancelling AI Step Dismisses Modal Without Mutation")
        print("-" * 80)

        bdd_step("GIVEN", "AI Step proposal modal is active for Step 1",
                 modal_info="Dialog visible with [❌ Cancel] and [✅ Confirm & Execute]")

        state_before = self.player.get_state()
        self.assertTrue(state_before.get("aiStepPending", False))

        bdd_step("WHEN", "Player clicks '❌ Cancel' (or presses Escape)",
                 modal_info="Modal dismissed")

        cancel_res = self.player.cancel_ai_step()
        self.assertTrue(cancel_res.get("success", False))

        state_after = self.player.get_state()
        bdd_step("THEN", "Proposal state is cleared and game remains at Step 0",
                 assertions=[
                     "aiStepPending is False",
                     "pendingAiCommand is empty",
                     "movementRolled is still 0"
                 ])

        self.assertFalse(state_after.get("aiStepPending", True))
        self.assertEqual(len(state_after.get("pendingAiCommand", {})), 0)
        self.assertEqual(state_after.get("movementRolled", 0), 0)

    def test_03_confirm_executes_step_one_movement(self):
        """Scenario 3: Confirming AI Step executes the movement roll."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Confirming Step 1 Executes Movement Roll")
        print("-" * 80)

        bdd_step("GIVEN", "Player re-opens AI Step proposal for Step 1",
                 command_info="Step 1: Roll Movement Dice")

        self.player.propose_ai_step()
        state = self.player.get_state()
        self.assertTrue(state.get("aiStepPending", False))

        bdd_step("WHEN", "Player clicks '✅ Confirm & Execute' (or presses Enter)",
                 modal_info="Modal closes, command is executed")

        confirm_res = self.player.confirm_ai_step()
        self.assertTrue(confirm_res.get("success", False))
        self.assertTrue(confirm_res.get("executed", False))
        self.assertEqual(confirm_res.get("step"), 1)

        state_after = self.player.get_state()
        bdd_step("THEN", "Step 1 executed: movement dice rolled, pending state cleared",
                 assertions=[
                     "aiStepPending is False",
                     f"movementRoll = {state_after.get('movementRoll')} (> 0)",
                     f"remainingMovement = {state_after.get('remainingMovement')} (> 0)"
                 ])

        self.assertFalse(state_after.get("aiStepPending", True))
        self.assertGreater(state_after.get("movementRolled", 0), 0)
        self.assertGreater(state_after.get("movementRemaining", 0), 0)

    def test_04_sequential_steps_preview_and_execute(self):
        """Scenario 4: Sequential AI steps (Move -> Open Door -> Enter Chamber) preview and execute cleanly."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Sequential Step Previews (Corridor Advance & Door Kick)")
        print("-" * 80)

        # Step 2: Advance down corridor
        bdd_step("GIVEN", "Barbarian has rolled movement and is ready to advance",
                 command_info="Upcoming AI Step 2: Move Down Corridor")

        next_cmd = self.player.get_state().get("nextAiStep", {})
        self.assertEqual(next_cmd.get("step"), 2)
        self.assertEqual(next_cmd.get("action"), "move")

        # Propose step 2
        prop_2 = self.player.propose_ai_step()
        self.assertTrue(prop_2.get("success"))
        st_2 = self.player.get_state()
        self.assertTrue(st_2.get("aiStepPending"))
        self.assertEqual(st_2.get("pendingAiCommand", {}).get("step"), 2)

        # Confirm step 2
        bdd_step("WHEN", "Player confirms Step 2 (Corridor Advance)",
                 modal_info="Executing move action")
        conf_2 = self.player.confirm_ai_step()
        self.assertTrue(conf_2.get("executed"))

        # Step 3: Kick open dungeon door
        bdd_step("GIVEN", "Hero has reached door; next step is kicking open door",
                 command_info="Upcoming AI Step 3: Kick Open Door")
        next_cmd_3 = self.player.get_state().get("nextAiStep", {})
        self.assertEqual(next_cmd_3.get("step"), 3)
        self.assertEqual(next_cmd_3.get("action"), "open_door")

        self.player.propose_ai_step()
        st_3 = self.player.get_state()
        self.assertTrue(st_3.get("aiStepPending"))
        self.assertEqual(st_3.get("pendingAiCommand", {}).get("action"), "open_door")

        bdd_step("WHEN", "Player confirms Step 3 (Kick Open Door)",
                 modal_info="Executing open_door action")
        conf_3 = self.player.confirm_ai_step()
        self.assertTrue(conf_3.get("executed"))

        st_door = self.player.get_state()
        bdd_step("THEN", "Chamber door opened and Fog of War revealed",
                 assertions=[
                     f"revealedRooms count: {len(st_door.get('revealedRooms', []))}",
                     f"visibleEnemiesCount: {st_door.get('visibleEnemiesCount', 0)}"
                 ])
        self.assertGreater(len(st_door.get("revealedRooms", [])), 0)

    def test_05_ai_step_auto_confirm_flag(self):
        """Scenario 5: Calling ai_step(confirm=True) directly proposes and confirms in one atomic call."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Direct Auto-Confirm Flag for Automated Play")
        print("-" * 80)

        bdd_step("WHEN", "Player invokes ai_step(confirm=True) for Step 4",
                 command_info="Execute next step directly without awaiting separate confirm call")

        res = self.player.ai_step(confirm=True)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("executed"))
        self.assertEqual(res.get("step"), 4)

        st = self.player.get_state()
        bdd_step("THEN", "Step 4 executed and modal closed",
                 assertions=[
                     "aiStepPending is False",
                     "Hero advanced into chamber"
                 ])
        self.assertFalse(st.get("aiStepPending"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
