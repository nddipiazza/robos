#!/usr/bin/env python3
"""
test_character_card_broadsword_icon_e2e.py
BDD End-to-End Test Suite verifying that:
1. Barbarian character card in tabletop HUD displays dedicated Broadsword icon (weapon_broadsword.png), NOT a healing potion icon.
2. Character card icon grid assigns category 'weapon' and texture 'res://assets/icons/ai/weapon_broadsword.png'.
3. Potion items in inventory correctly resolve to 'item_healing_potion.png' with isPotion=True, distinct from weapons.
4. Other hero weapons (Dwarf shortsword, Elf shortsword, Wizard dagger, Wizard staff) resolve to their dedicated weapon textures.
5. Character sheet dialog (HeroDetailModal) equipment & inventory section renders Broadsword with weapon texture and 'Weapon' badge.
6. Visual proof screenshot is captured and saved to artifacts.
"""

import os
import sys
import time
import unittest
import subprocess
from PIL import Image

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(TESTS_DIR)
sys.path.insert(0, ROOT_DIR)
sys.path.insert(0, TESTS_DIR)

from rpc_ai.tabletop_qa_player import TabletopQAPlayer


def bdd_scenario_header(num: int, title: str):
    print(f"\n{'=' * 85}")
    print(f"⚔️ SCENARIO {num:02d}: {title}")
    print(f"{'=' * 85}")


def bdd_step(step_type: str, text: str, info: str = None, assertions: list = None):
    print(f"  {step_type.upper():<7} {text}")
    if info:
        print(f"    📜  [INFO]       {info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]  {a}")


class TestCharacterCardBroadswordIconE2E(unittest.TestCase):
    proc = None
    player = None
    port = 18140

    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("⚔️ FEATURE: Character Card Dedicated Weapon Icon Mapping (Broadsword vs Potion)")
        print("   Rule: Broadsword must render res://assets/icons/ai/weapon_broadsword.png")
        print("   Rule: Must NEVER fall back to item_healing_potion.png on character cards or modals")
        print("=" * 90)

        play_script = os.path.join(ROOT_DIR, "play.sh")
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [play_script, "--headless", "--role=player"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port, human_delay=0.1)
        if not cls.player.wait_for_ready(12.0):
            if cls.proc:
                cls.proc.terminate()
            raise RuntimeError("Tabletop test server failed to become ready.")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            try:
                cls.proc.terminate()
                cls.proc.wait(timeout=2.0)
            except Exception:
                cls.proc.kill()

    def test_01_barbarian_card_broadsword_icon(self):
        bdd_scenario_header(1, "Barbarian Card Equipped Weapon Displays Broadsword Icon (Not Potion)")
        st = self.player.get_state()
        char_cards = st.get("characterCards", [])
        barb = next((c for c in char_cards if c.get("id") == "barbarian"), None)
        self.assertIsNotNone(barb, "Barbarian card must exist in state")

        bdd_step("GIVEN", "Barbarian enters dungeon with standard Broadsword loadout",
                 info=f"Hero: {barb.get('name')} | Weapon: {barb.get('weapon')}")

        bdd_step("WHEN", "TabletopWorld creates Barbarian character card in HeroCardsGrid",
                 info="Icon grid renders equipped weapon and inventory items")

        weapon_tex = barb.get("weaponTexture", "")
        bdd_step("THEN", "Barbarian equipped weaponTexture points to weapon_broadsword.png",
                 assertions=[
                     f"weapon: '{barb.get('weapon')}' == 'broadsword'",
                     f"weaponTexture: '{weapon_tex}' ends with 'weapon_broadsword.png'",
                     "weaponTexture does NOT contain 'potion'"
                 ])
        self.assertEqual(barb.get("weapon"), "broadsword")
        self.assertTrue(weapon_tex.endswith("weapon_broadsword.png"), f"Expected weapon_broadsword.png, got {weapon_tex}")
        self.assertNotIn("potion", weapon_tex)

        card_icons = barb.get("cardIcons", [])
        w_icon = next((i for i in card_icons if i.get("id") == "broadsword" or i.get("type") == "weapon"), None)
        self.assertIsNotNone(w_icon, "Broadsword icon must be in cardIcons")
        self.assertEqual(w_icon.get("type"), "weapon")
        self.assertEqual(w_icon.get("name"), "Broadsword")
        self.assertTrue(w_icon.get("texture", "").endswith("weapon_broadsword.png"))
        self.assertFalse(w_icon.get("isPotion", True), "Broadsword must NOT have isPotion=True")

    def test_02_potion_item_remains_distinct_potion_icon(self):
        bdd_scenario_header(2, "Healing Potion in Inventory Remains Potion Icon with isPotion=True")
        st = self.player.get_state()
        char_cards = st.get("characterCards", [])
        barb = next((c for c in char_cards if c.get("id") == "barbarian"), None)
        self.assertIsNotNone(barb)

        card_icons = barb.get("cardIcons", [])
        pot_icon = next((i for i in card_icons if i.get("id") == "healing_potion"), None)
        self.assertIsNotNone(pot_icon, "Healing potion must be in cardIcons")

        bdd_step("THEN", "Potion of Healing resolves to item_healing_potion.png",
                 assertions=[
                     f"pot_icon type: '{pot_icon.get('type')}' == 'item'",
                     f"pot_icon texture: '{pot_icon.get('texture')}' ends with 'item_healing_potion.png'",
                     f"pot_icon isPotion: {pot_icon.get('isPotion')} == True"
                 ])
        self.assertEqual(pot_icon.get("type"), "item")
        self.assertTrue(pot_icon.get("texture", "").endswith("item_healing_potion.png"))
        self.assertTrue(pot_icon.get("isPotion"))

    def test_03_other_hero_weapons_resolve_correctly(self):
        bdd_scenario_header(3, "Other Hero Weapons (Shortsword, Dagger, Staff) Resolve Accurately")
        st = self.player.get_state()
        char_cards = st.get("characterCards", [])

        # Dwarf
        dwarf = next((c for c in char_cards if c.get("id") == "dwarf"), None)
        self.assertIsNotNone(dwarf)
        d_tex = dwarf.get("weaponTexture", "")
        self.assertTrue(d_tex.endswith("weapon_shortsword.png"), f"Dwarf weapon texture expected shortsword, got {d_tex}")

        # Elf
        elf = next((c for c in char_cards if c.get("id") == "elf"), None)
        self.assertIsNotNone(elf)
        e_tex = elf.get("weaponTexture", "")
        self.assertTrue(e_tex.endswith("weapon_shortsword.png"), f"Elf weapon texture expected shortsword, got {e_tex}")

        # Wizard
        wiz = next((c for c in char_cards if c.get("id") == "wizard"), None)
        self.assertIsNotNone(wiz)
        w_tex = wiz.get("weaponTexture", "")
        self.assertTrue(w_tex.endswith("weapon_dagger.png"), f"Wizard weapon texture expected dagger, got {w_tex}")

        # Wizard backup staff
        wiz_staff = next((i for i in wiz.get("cardIcons", []) if i.get("id") == "staff"), None)
        self.assertIsNotNone(wiz_staff, "Wizard staff must be in cardIcons")
        self.assertEqual(wiz_staff.get("type"), "weapon")
        self.assertTrue(wiz_staff.get("texture", "").endswith("weapon_staff.png"))
        self.assertFalse(wiz_staff.get("isPotion"))

        bdd_step("THEN", "All hero weapons resolve to their dedicated icons",
                 assertions=[
                     "Dwarf -> weapon_shortsword.png",
                     "Elf -> weapon_shortsword.png",
                     "Wizard equipped -> weapon_dagger.png",
                     "Wizard backpack -> weapon_staff.png"
                 ])

    def test_04_character_sheet_modal_broadsword_icon(self):
        bdd_scenario_header(4, "Character Sheet Modal (HeroDetailModal) Renders Broadsword as Weapon")
        open_res = self.player._post("/action", {"action": "open_hero_detail", "hero_id": "barbarian"})
        self.assertTrue(open_res.get("success"), f"Opening detail modal failed: {open_res}")

        st = self.player.get_state()
        modal = st.get("heroDetailModal", {})
        self.assertTrue(modal.get("visible"), "HeroDetailModal must be visible")
        self.assertEqual(modal.get("heroId"), "barbarian")

        inv_items = modal.get("inventoryItems", [])
        self.assertGreaterEqual(len(inv_items), 2, "Barbarian detail modal must list at least 2 items")

        bw_item = next((it for it in inv_items if it.get("id") == "broadsword"), None)
        self.assertIsNotNone(bw_item, "Broadsword must be listed in detail modal inventory items")

        bdd_step("THEN", "Broadsword in detail modal is categorized as 'weapon' with weapon_broadsword.png",
                 assertions=[
                     f"bw_item category: '{bw_item.get('category')}' == 'weapon'",
                     f"bw_item texture: '{bw_item.get('texture')}' ends with 'weapon_broadsword.png'",
                     f"bw_item isPotion: {bw_item.get('isPotion')} == False"
                 ])
        self.assertEqual(bw_item.get("category"), "weapon")
        self.assertTrue(bw_item.get("texture", "").endswith("weapon_broadsword.png"))
        self.assertFalse(bw_item.get("isPotion"))

        # Close modal
        close_res = self.player._post("/action", {"action": "close_hero_detail"})
        self.assertTrue(close_res.get("success"))

    def test_05_visual_proof_screenshot(self):
        bdd_scenario_header(5, "Capture Visual Proof Screenshot of Character Card Broadsword Icon")
        out_shot = "/tmp/tabletop_broadsword_character_card.png"
        res = self.player.take_screenshot(out_shot)
        self.assertTrue(res.get("success") or os.path.exists(out_shot), "Screenshot capture must succeed")
        self.assertGreater(os.path.getsize(out_shot), 5000, "Screenshot size must be > 5KB")

        dest_artifact = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f/tabletop_broadsword_character_card.png"
        import shutil
        shutil.copyfile(out_shot, dest_artifact)
        self.assertTrue(os.path.exists(dest_artifact))

        # Crop hero cards area in bottom-right/side
        crop_dest = "/home/ndipiazza/.gemini/antigravity/brain/ecd6859c-9e96-4f38-b78f-3eccec8ad76f/tabletop_broadsword_hero_card_crop.png"
        try:
            im = Image.open(out_shot)
            w, h = im.size
            crop_box = (max(0, w - 320), 40, w, min(h, 450))
            cropped = im.crop(crop_box)
            cropped.save(crop_dest)
            bdd_step("THEN", f"Cropped hero cards proof saved to {crop_dest}")
        except Exception as e:
            print(f"Crop exception: {e}")

        bdd_step("THEN", f"Visual proof screenshot saved to {dest_artifact} ({os.path.getsize(dest_artifact):,} bytes)")


if __name__ == "__main__":
    unittest.main()
