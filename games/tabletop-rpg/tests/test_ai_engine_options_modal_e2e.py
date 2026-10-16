#!/usr/bin/env python3
"""
BDD E2E Test Suite: AI Engine Options Modal & Header AI Icon

Feature:
  As a tabletop player:
  I want an AI icon button outside the main action toolbar that opens an 'AI Engine Options' dialog
  With two checkboxes:
    [ ] - ai play for you
    [ ] - automatically go to the next turn without your input
  So that I can granularly govern autonomous agent play vs manual hero control.

Scenarios:
  1. AI icon button (BtnAIEngineOptions) is placed in SidebarHeader; main toolbar action tile (BtnAIStep) is hidden.
  2. Opening the dialog presents 'AI Engine Options' modal with the two exact checkbox controls.
  3. Configuring 'ai play for you' and 'automatically go to next turn' updates engine mode and button badge.
  4. Closing and toggling the modal functions cleanly.
  5. Captures screenshot proof of the RPG modal with checkboxes.
"""

import os
import signal
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
from rpc_ai.tabletop_qa_player import TabletopQAPlayer


class TestAIEngineOptionsModalE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18195
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.screenshot_path = os.path.join(TESTS_DIR, "recordings", "ai_engine_options_dialog_proof.png")
        os.makedirs(os.path.dirname(cls.screenshot_path), exist_ok=True)

    def setUp(self):
        self.proc = None
        self.player = None

    def _stop_game(self):
        if self.proc:
            try:
                pgid = os.getpgid(self.proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            try:
                self.proc.wait(timeout=2.0)
            except Exception:
                pass
            self.proc = None
        if self.player:
            self.player = None

    def tearDown(self):
        self._stop_game()

    def _start_game(self, extra_args=None, extra_env=None):
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(self.port))
        if extra_env:
            env.update(extra_env)

        cmd = ["xvfb-run", "--auto-servernum", self.play_script, "--role=player", "--headless"]
        if extra_args:
            cmd.extend(extra_args)

        self.proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )
        self.player = TabletopQAPlayer(port=self.port, human_delay=0.05)
        self.assertTrue(self.player.wait_for_ready(timeout=14.0), "Godot Tabletop server failed to start")

    def test_01_ai_button_in_header_and_not_in_main_toolbar(self):
        print("\n==========================================================================================")
        print("🤖 SCENARIO 01: AI button in SidebarHeader and removed/hidden from main action toolbar")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game UI is loaded")
        st = self.player.get_state()

        print("  WHEN    Inspecting UI header controls and action toolbar")
        scene_ui = st.get("scene", {}).get("ui", {})
        header_btns = scene_ui.get("headerButtons", [])
        action_btns = scene_ui.get("actionButtons", [])

        print(f"    ✔  Header buttons: {header_btns}")
        print(f"    ✔  Action toolbar buttons: {action_btns}")

        # Assert BtnAIEngineOptions is in the header
        self.assertIn("BtnAIEngineOptions", header_btns, "BtnAIEngineOptions not found in header!")
        print("    ✔  [ASSERTION] BtnAIEngineOptions is in SidebarHeader outside main toolbar")

        # Assert BtnAIStep is NOT in the active action toolbar
        self.assertNotIn("BtnAIStep", action_btns, "BtnAIStep is still visible in main action toolbar!")
        print("    ✔  [ASSERTION] BtnAIStep is hidden/removed from main action toolbar")

    def test_02_open_ai_options_dialog_and_verify_checkboxes(self):
        print("\n==========================================================================================")
        print("🤖 SCENARIO 02: Open AI Engine Options dialog and verify checkboxes")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Modal is initially closed")
        self.assertFalse(self.player.is_ai_options_open(), "AI Options modal should initially be closed")

        print("  WHEN    open_ai_options is executed")
        res = self.player.open_ai_options()
        self.assertTrue(res.get("success", False), "open_ai_options failed")

        print("  THEN    Modal is visible and state reflects AI options")
        self.assertTrue(self.player.is_ai_options_open(), "AI Options modal is not open")

        st = self.player.get_state()
        ai_opts = st.get("aiEngineOptions", {})
        print(f"    ✔  [ASSERTION] aiEngineOptions: {ai_opts}")
        self.assertIn("aiPlayForYou", ai_opts)
        self.assertIn("autoAdvanceTurn", ai_opts)
        self.assertTrue(ai_opts.get("isModalOpen", False))

        # Take screenshot proof of dialog
        self.player.take_screenshot(self.screenshot_path)
        print(f"    ✔  [PROOF] Captured screenshot of modal: {self.screenshot_path}")

    def test_03_configure_ai_options_modes(self):
        print("\n==========================================================================================")
        print("🤖 SCENARIO 03: Granular configuration of AI options (Step vs Auto-Play)")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        # Mode A: Both checked (Continuous Autonomous Auto-Play)
        print("  WHEN    Enabling both 'ai play for you' and 'automatically go to next turn'")
        res = self.player.set_ai_options(ai_play_for_you=True, auto_advance_turn=True)
        self.assertTrue(res.get("success", False))
        st = self.player.get_state()
        self.assertTrue(st.get("aiPlayForYou", False))
        self.assertTrue(st.get("autoAdvanceTurn", False))
        self.assertTrue(st.get("autoPlayEnabled", False))
        print("    ✔  [ASSERTION] Both checked -> Full continuous auto_play_enabled == True")

        # Mode B: AI play enabled, auto-advance disabled (Step-by-step AI with review)
        print("  WHEN    Setting ai_play_for_you=True, auto_advance_turn=False")
        res = self.player.set_ai_options(ai_play_for_you=True, auto_advance_turn=False)
        self.assertTrue(res.get("success", False))
        st = self.player.get_state()
        self.assertTrue(st.get("aiPlayForYou", False))
        self.assertFalse(st.get("autoAdvanceTurn", False))
        self.assertFalse(st.get("autoPlayEnabled", False))
        print("    ✔  [ASSERTION] Step-by-step AI active -> auto_play_enabled == False")

        # Mode C: AI play disabled, auto-advance enabled (Manual play with auto-advance)
        print("  WHEN    Setting ai_play_for_you=False, auto_advance_turn=True")
        res = self.player.set_ai_options(ai_play_for_you=False, auto_advance_turn=True)
        self.assertTrue(res.get("success", False))
        st = self.player.get_state()
        self.assertFalse(st.get("aiPlayForYou", False))
        self.assertTrue(st.get("autoAdvanceTurn", False))
        self.assertFalse(st.get("autoPlayEnabled", False))
        print("    ✔  [ASSERTION] Manual play with auto-advance active")

        # Mode D: Both disabled (Pure manual HeroQuest play)
        print("  WHEN    Disabling both options")
        res = self.player.set_ai_options(ai_play_for_you=False, auto_advance_turn=False)
        self.assertTrue(res.get("success", False))
        st = self.player.get_state()
        self.assertFalse(st.get("aiPlayForYou", False))
        self.assertFalse(st.get("autoAdvanceTurn", False))
        self.assertFalse(st.get("autoPlayEnabled", False))
        print("    ✔  [ASSERTION] Both disabled -> Standard manual gameplay")

    def test_04_toggle_and_close_modal(self):
        print("\n==========================================================================================")
        print("🤖 SCENARIO 04: Toggle and close AI Engine Options modal")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        self.assertFalse(self.player.is_ai_options_open())
        self.player.toggle_ai_options()
        self.assertTrue(self.player.is_ai_options_open())
        print("    ✔  [ASSERTION] toggle_ai_options opens modal when closed")

        self.player.close_ai_options()
        self.assertFalse(self.player.is_ai_options_open())
        print("    ✔  [ASSERTION] close_ai_options closes modal")


if __name__ == "__main__":
    unittest.main()
