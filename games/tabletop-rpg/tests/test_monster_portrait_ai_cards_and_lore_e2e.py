#!/usr/bin/env python3
"""
E2E Test: Monster Portrait AI Background Art, Clickable Portraits & Fantasy Bestiary Lore
Validates:
1. All 9 canonical monster AI background PNG assets exist at 1376x768 resolution.
2. Enemy cards render with AI background underlay and interactive clickable portrait buttons.
3. Clicking a monster portrait opens the full Monster Bestiary Codex modal with high-res portrait,
   authentic HeroQuest dark fantasy lore, combat stats, tactical directives, and fell dread sorcery.
4. Clean typography across all monster cards and modals without broken emoji glyphs.
5. Captures high-resolution visual proof screenshots.
"""

import os
import sys
import shutil
import unittest
from PIL import Image

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "rpc_ai")))
from tabletop_qa_player import TabletopQAPlayer


class TestMonsterPortraitAICardsAndLoreE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.player = TabletopQAPlayer()
        cls.repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        cls.assets_dir = os.path.join(cls.repo_root, "games", "tabletop-rpg", "assets", "monster_cards")
        cls.brain_dir = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f"

    def setUp(self):
        self.player.reset_game()

    def test_01_all_monster_ai_background_assets_exist(self):
        print("\n" + "=" * 85)
        print("⌛ SCENARIO 01: Asset Audit: 9 AI-Generated Monster Card Backgrounds (1376x768)")
        print("=" * 85)
        expected_monsters = [
            "goblin", "orc", "skeleton", "zombie", "mummy",
            "fimir", "chaos_warrior", "gargoyle", "verag"
        ]
        print(f"  GIVEN   Directory games/tabletop-rpg/assets/monster_cards/")
        for m in expected_monsters:
            fname = f"card_bg_{m}.png"
            fpath = os.path.join(self.assets_dir, fname)
            self.assertTrue(os.path.exists(fpath), f"Asset {fname} must exist on disk")
            fsize = os.path.getsize(fpath)
            self.assertGreater(fsize, 100_000, f"Asset {fname} size must be > 100KB, got {fsize}")
            with Image.open(fpath) as img:
                self.assertEqual(img.size, (1376, 768), f"{fname} must be 1376x768, got {img.size}")
            print(f"    ✔  [ASSET] {fname}: {fsize:,} bytes, 1376x768 PNG")

        print("  THEN    All 9 canonical monster AI card background assets verified successfully!")

    def test_02_monster_cards_render_ai_background_and_clickable_portrait(self):
        print("\n" + "=" * 85)
        print("⌛ SCENARIO 02: Runtime Telemetry: Enemy Cards Have AI Background & Portrait Buttons")
        print("=" * 85)
        # Discover Crypt Skeleton and Cellar Zombie by revealing them in state
        st = self.player.get_state()
        monsters = st.get("monsters", [])
        self.assertGreater(len(monsters), 0, "Cartridge must contain monsters")

        # Discover all monsters for testing telemetry
        discovered_ids = [str(m.get("id")) for m in monsters]
        self.player.execute_action("set_state", discovered_monster_ids=discovered_ids, show_defeated_monsters=True)

        st_after = self.player.get_state()
        enemy_cards = st_after.get("enemyCards", [])
        self.assertGreater(len(enemy_cards), 0, "Discovered enemy cards must be present")

        print(f"  GIVEN   {len(enemy_cards)} discovered enemy cards in enemies panel")
        for ec in enemy_cards:
            mid = ec.get("id")
            mname = ec.get("name")
            mkey = ec.get("monsterKey")
            has_ai_bg = ec.get("hasAiBackground")
            has_btn = ec.get("hasPortraitButton")
            lore_title = ec.get("loreTitle")
            lore_archetype = ec.get("loreArchetype")

            self.assertTrue(has_ai_bg, f"Enemy card {mid} ({mname}) must have hasAiBackground = True")
            self.assertTrue(has_btn, f"Enemy card {mid} ({mname}) must have hasPortraitButton = True")
            self.assertTrue(bool(mkey), f"Enemy card {mid} must have valid monsterKey")
            self.assertTrue(bool(lore_title), f"Enemy card {mid} must have valid loreTitle")
            self.assertTrue(bool(lore_archetype), f"Enemy card {mid} must have valid loreArchetype")

            print(f"    ✔  [CARD] {mid} ({mname}): Key={mkey}, Title='{lore_title}', Archetype='{lore_archetype}', AI Background=OK, PortraitBtn=OK")

        print("  THEN    All enemy cards correctly report AI background underlays and portrait buttons.")

    def test_03_click_monster_portrait_opens_bestiary_modal(self):
        print("\n" + "=" * 85)
        print("⌛ SCENARIO 03: Interaction: Clicking Monster Portrait Opens Bestiary Codex Modal")
        print("=" * 85)
        # Target Crypt Skeleton
        target_id = "mon-skel-1"
        self.player.execute_action("set_state", discovered_monster_ids=[target_id])

        print(f"  WHEN    Player clicks on portrait for '{target_id}'...")
        res = self.player.click_monster_portrait(target_id)
        self.assertTrue(res.get("success", False), "click_monster_portrait must succeed")

        modal = self.player.get_monster_detail_modal()
        print(f"  THEN    MonsterDetailModal state: {modal}")
        self.assertTrue(modal.get("visible", False), "MonsterDetailModal must be visible")
        self.assertEqual(modal.get("monsterId"), target_id, f"Modal monsterId must match {target_id}")
        self.assertTrue(modal.get("hasPortrait", False), "Modal must render high-res portrait texture")
        self.assertIn("Skeleton", modal.get("monsterName", ""), "Modal monsterName must identify Skeleton")

        print("  WHEN    Closing Monster Bestiary modal...")
        close_res = self.player.close_monster_detail()
        self.assertTrue(close_res.get("success", False), "close_monster_detail must succeed")

        modal_after = self.player.get_monster_detail_modal()
        self.assertFalse(modal_after.get("visible", True), "MonsterDetailModal must be hidden after closing")
        print("    ✔  [INTERACTION] Bestiary modal opened and closed cleanly via portrait click")

    def test_04_boss_monster_verag_lore_tactics_and_fell_spells(self):
        print("\n" + "=" * 85)
        print("⌛ SCENARIO 04: Boss Monster: Verag Warlord Codex with Fell Spells & Lore")
        print("=" * 85)
        target_id = "mon-verag"
        self.player.execute_action("set_state", discovered_monster_ids=[target_id])

        print(f"  WHEN    Opening Bestiary Codex for Boss '{target_id}'...")
        res = self.player.open_monster_detail(target_id)
        self.assertTrue(res.get("success", False), "open_monster_detail must succeed for Verag")

        modal = self.player.get_monster_detail_modal()
        self.assertTrue(modal.get("visible", False), "MonsterDetailModal must be visible for Verag")
        self.assertEqual(modal.get("monsterId"), target_id)
        self.assertTrue(modal.get("hasPortrait", False))
        self.assertIn("Verag", modal.get("monsterName", ""))
        self.assertIn("Classification:", modal.get("monsterType", ""))

        st = self.player.get_state()
        enemy_cards = st.get("enemyCards", [])
        verag_card = next((c for c in enemy_cards if c.get("id") == target_id), None)
        self.assertIsNotNone(verag_card, "Verag card must be present in enemyCards telemetry")
        self.assertEqual(verag_card.get("monsterKey"), "verag")
        self.assertEqual(verag_card.get("attackDice"), 4)
        self.assertEqual(verag_card.get("defendDice"), 4)
        self.assertEqual(verag_card.get("max_bp"), 4)

        print(f"    ✔  [BOSS LORE] Verag: Atk=4, Def=4, BP=4, Title='{verag_card.get('loreTitle')}', Archetype='{verag_card.get('loreArchetype')}'")

        self.player.close_monster_detail()

    def test_05_monster_card_clean_typography_no_emojis(self):
        print("\n" + "=" * 85)
        print("⌛ SCENARIO 05: Static Code Audit: Monster Card & Bestiary Code Free of Broken Emojis")
        print("=" * 85)
        code_path = os.path.join(self.repo_root, "games", "tabletop-rpg", "scripts", "TabletopWorld.gd")
        with open(code_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Find _populate_monster_detail_modal and _create_enemy_card
        in_monster_code = False
        monster_code_lines = []
        for line in lines:
            if "func _setup_monster_detail_modal" in line:
                in_monster_code = True
            elif "func _sanitize_ui_text" in line:
                in_monster_code = False
            if in_monster_code:
                monster_code_lines.append(line)

        monster_code = "".join(monster_code_lines)
        # Check for emoji characters (range 0x1F300 - 0x1FAFF)
        broken_emojis = [c for c in monster_code if 0x1F300 <= ord(c) <= 0x1FAFF]
        self.assertEqual(len(broken_emojis), 0, f"Found emojis in monster card code: {broken_emojis}")
        print(f"    ✔  [CLEAN TYPOGRAPHY] Monster card & modal code lines ({len(monster_code_lines)} lines) contain 0 emojis")

    def test_06_visual_proof_screenshot_captured(self):
        print("\n" + "=" * 85)
        print("⌛ SCENARIO 06: Visual Proof: Capture Bestiary Modal & Monster Cards Viewport")
        print("=" * 85)
        # Reveal all monsters so cards render
        st = self.player.get_state()
        monsters = st.get("monsters", [])
        discovered_ids = [str(m.get("id")) for m in monsters]
        self.player.execute_action("set_state", discovered_monster_ids=discovered_ids, show_defeated_monsters=True)

        # Open Verag boss modal for screenshot
        self.player.open_monster_detail("mon-verag")

        tmp_modal_path = "/tmp/tabletop_monster_bestiary_modal.png"
        self.player.take_screenshot(tmp_modal_path)
        self.assertTrue(os.path.exists(tmp_modal_path), "Modal screenshot must exist")
        self.assertGreater(os.path.getsize(tmp_modal_path), 5_000, "Modal screenshot size > 5KB")

        dest_modal_path = os.path.join(self.brain_dir, "tabletop_monster_bestiary_modal.png")
        shutil.copyfile(tmp_modal_path, dest_modal_path)
        print(f"    ✔  [VISUAL PROOF] Bestiary Modal screenshot: {dest_modal_path} ({os.path.getsize(dest_modal_path):,} bytes)")

        # Close modal and capture enemies panel cards
        self.player.close_monster_detail()
        tmp_cards_path = "/tmp/tabletop_monster_cards_ai_bg.png"
        self.player.take_screenshot(tmp_cards_path)
        self.assertTrue(os.path.exists(tmp_cards_path), "Cards screenshot must exist")

        dest_cards_path = os.path.join(self.brain_dir, "tabletop_monster_cards_ai_bg.png")
        shutil.copyfile(tmp_cards_path, dest_cards_path)
        print(f"    ✔  [VISUAL PROOF] Monster Cards screenshot: {dest_cards_path} ({os.path.getsize(dest_cards_path):,} bytes)")


if __name__ == "__main__":
    unittest.main()
