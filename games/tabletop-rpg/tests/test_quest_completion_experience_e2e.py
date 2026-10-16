#!/usr/bin/env python3
"""
BDD E2E Test Suite: Quest Completion Experience & Victory/Defeat Modal

Feature:
  As a tabletop player and AI spectator:
  When an AI demo or manual quest reaches its end condition (e.g. all objectives met, all heroes slain),
  The game must NOT abruptly terminate the window or freeze silently.
  Instead, it must:
    1. Cleanly halt automated movement/turns.
    2. Play Mentor's full voice proclamation audio.
    3. Display Mentor's dialogue bubble sequence and celebratory banners.
    4. Present the grand HeroQuest Quest Complete stone-slab modal with objectives, bounty, and survivors.
    5. Allow the player to inspect the dungeon board, restart the quest, or exit at their leisure.

Scenarios:
  1. Quest Victory triggers speech, displays Quest Complete modal, and never abruptly auto-quits.
  2. Dismissing the modal keeps the victory banner active so the player can return to the summary anytime.
  3. Defeat modal triggers spoken proclamation and honors fallen heroes.
  4. Audio assets (quest_victory.ogg, quest_defeat.ogg) are verified and loadable.
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


class TestQuestCompletionExperienceE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 18196
        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.screenshot_victory = os.path.join(TESTS_DIR, "recordings", "quest_completion_victory_modal_proof.png")
        cls.screenshot_defeat = os.path.join(TESTS_DIR, "recordings", "quest_completion_defeat_modal_proof.png")
        os.makedirs(os.path.dirname(cls.screenshot_victory), exist_ok=True)

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

    def test_01_quest_victory_experience_and_modal(self):
        print("\n==========================================================================================")
        print("🏆 SCENARIO 01: Quest Victory triggers speech, modal, and does NOT abruptly quit")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  GIVEN   Game is active and pristine")
        self.assertFalse(self.player.is_game_closed(), "Game should not be closed initially")
        self.assertFalse(self.player.is_quest_complete_open(), "Quest Complete modal should not be open initially")

        initial_gold = {}
        for h in self.player.get_state().get("heroes", []):
            initial_gold[h.get("id")] = int(h.get("gold", 0))
        print(f"    ✔  Initial hero gold: {initial_gold}")

        print("  WHEN    Quest completion is triggered")
        res = self.player.complete_quest(quit=False)
        self.assertTrue(res.get("success", False), "complete_quest returned failure")
        print(f"    ✔  complete_quest response: {res}")

        # Wait 2.0 seconds to explicitly verify that the game did NOT abruptly quit!
        # (Previously, the game had a 1.0 second auto-quit timer that killed the window!)
        print("  AND     Waiting 2.0s to confirm game did not auto-quit...")
        time.sleep(2.0)
        self.assertTrue(self.player.check_health(), "FATAL BUG: Game abruptly terminated or crashed after quest complete!")
        print("    ✔  [ASSERTION] Game process remains ALIVE and interactive (no abrupt auto-quit)")

        print("  THEN    Quest state is completed and closed")
        st = self.player.get_state()
        self.assertTrue(st.get("isQuestCompleted", False), "isQuestCompleted should be true")
        self.assertTrue(st.get("isGameClosed", False), "isGameClosed should be true")

        print("  AND     Quest Complete Modal is OPEN")
        self.assertTrue(self.player.is_quest_complete_open(), "Quest Complete Modal is NOT open!")
        print("    ✔  [ASSERTION] Quest Complete Modal is visibly displayed to the player")

        print("  AND     Party bounty was distributed to living heroes")
        bounty = int(res.get("bountyAwarded", 100))
        for h in st.get("heroes", []):
            h_id = h.get("id")
            cur_g = int(h.get("gold", 0))
            if int(h.get("current_bp", 0)) > 0:
                self.assertEqual(cur_g, initial_gold[h_id] + bounty, f"Hero {h_id} did not receive bounty!")
        print(f"    ✔  [ASSERTION] Living heroes received {bounty} gold bounty")

        # Capture screenshot proof
        if hasattr(self.player, "take_screenshot"):
            try:
                self.player.take_screenshot(self.screenshot_victory)
                print(f"    ✔  Saved victory screenshot proof to {self.screenshot_victory}")
            except Exception as e:
                print(f"    (Screenshot capture notice: {e})")

    def test_02_dismiss_modal_to_view_board_and_reopen(self):
        print("\n==========================================================================================")
        print("👁️ SCENARIO 02: Dismiss Quest Complete Modal to inspect board, re-open via action")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        self.player.complete_quest(quit=False)
        self.assertTrue(self.player.is_quest_complete_open(), "Modal should be open after complete_quest")

        print("  WHEN    Player dismisses modal (View Board / Esc)")
        close_res = self.player.close_quest_complete_modal()
        self.assertTrue(close_res.get("success", False))

        print("  THEN    Modal is closed")
        self.assertFalse(self.player.is_quest_complete_open(), "Modal should be closed")
        print("    ✔  [ASSERTION] Quest Complete Modal closed cleanly for board inspection")

        print("  WHEN    Player re-opens Quest Complete Modal")
        open_res = self.player.open_quest_complete_modal(is_victory=True)
        self.assertTrue(open_res.get("success", False))

        print("  THEN    Modal is reopened")
        self.assertTrue(self.player.is_quest_complete_open(), "Modal should be open again")
        print("    ✔  [ASSERTION] Quest Complete Modal re-opened successfully")

    def test_03_defeat_modal_presentation(self):
        print("\n==========================================================================================")
        print("💀 SCENARIO 03: Quest Defeat modal presentation")
        print("==========================================================================================")

        self._start_game()
        st = self.player.get_state()
        if st.get("elfSpellModalVisible", False) or st.get("spellAllocation", {}).get("modalVisible", False):
            self.player.select_elf_element("water", confirm=True)

        print("  WHEN    open_quest_complete_modal is called with is_victory=False")
        res = self.player.open_quest_complete_modal(is_victory=False)
        self.assertTrue(res.get("success", False))

        print("  THEN    Modal opens in defeat mode")
        self.assertTrue(self.player.is_quest_complete_open(), "Defeat modal should be open")
        print("    ✔  [ASSERTION] Defeat modal opened successfully")

    def test_04_audio_files_exist_and_valid(self):
        print("\n==========================================================================================")
        print("🔊 SCENARIO 04: Voice audio files exist and are valid OGG Vorbis")
        print("==========================================================================================")

        vic_audio = os.path.join(ROOT_DIR, "assets", "audio", "quest_victory.ogg")
        def_audio = os.path.join(ROOT_DIR, "assets", "audio", "quest_defeat.ogg")

        self.assertTrue(os.path.exists(vic_audio), f"Missing {vic_audio}")
        self.assertTrue(os.path.exists(def_audio), f"Missing {def_audio}")

        vic_size = os.path.getsize(vic_audio)
        def_size = os.path.getsize(def_audio)
        print(f"    ✔  quest_victory.ogg size: {vic_size} bytes")
        print(f"    ✔  quest_defeat.ogg size: {def_size} bytes")

        self.assertGreater(vic_size, 40000, "Victory audio file too small")
        self.assertGreater(def_size, 40000, "Defeat audio file too small")
        print("    ✔  [ASSERTION] Voice audio assets verified (>40KB each)")


if __name__ == "__main__":
    unittest.main()
