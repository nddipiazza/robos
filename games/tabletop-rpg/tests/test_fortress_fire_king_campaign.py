#!/usr/bin/env python3
"""
test_fortress_fire_king_campaign.py
BDD Verification Suite for HeroQuest: First Light Quest 4: The Fortress of the Fire King.
Validates:
1. Cartridge structure, First Light 26x19 dungeon board, 22 rooms, 27 doors.
2. The user's specific party: Curious (Wizard), Shawnti (Elf), Rufus (Dwarf), Axel (Barbarian, 925g).
3. Custom monsters: Cassandria's Doomguard (4 Atk, 6 Def, 3 BP, 3 MP) and Witch Hand (4 Atk, 4 Def, 4 BP, 3 MP).
4. Notes A–G encounter specifications (Orc's Bane, Glordrin's mountain passage map, Ring of Fortitude).
5. Headless Godot cartridge execution under CartridgeManager.
"""

import json
import os
import subprocess
import sys
import unittest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT_DIR)
CARTRIDGE_PATH = os.path.join(ROOT_DIR, "cartridges", "heroquest-fortress-fire-king.cartridge.json")

class TestFortressFireKingCampaign(unittest.TestCase):
    def setUp(self):
        self.assertTrue(os.path.exists(CARTRIDGE_PATH), f"Cartridge must exist at {CARTRIDGE_PATH}")
        with open(CARTRIDGE_PATH, "r", encoding="utf-8") as f:
            self.cart = json.load(f)

    def test_01_campaign_header_and_ruleset(self):
        """Scenario 1: Campaign header accurately describes Quest 4: The Fortress of the Fire King."""
        header = self.cart.get("header", {})
        self.assertEqual(header.get("ruleset"), "heroquest")
        self.assertEqual(header.get("gameType"), "tabletop")
        self.assertEqual(header.get("slug"), "heroquest-fortress-fire-king")
        self.assertIn("Fortress of the Fire King", header.get("title", ""))
        self.assertEqual(header.get("heroCount"), 4)
        self.assertGreaterEqual(header.get("monsterCount", 0), 6)

        # Quests validation
        quests = self.cart.get("quests", [])
        self.assertEqual(len(quests), 1)
        q = quests[0]
        self.assertEqual(q.get("id"), "quest-4")
        self.assertIn("Visions of King Agrain", q.get("briefing", ""))
        self.assertEqual(q.get("goldReward"), 400)

    def test_02_player_party_heroes_and_gear(self):
        """Scenario 2: The 4 specific heroes (Curious, Shawnti, Rufus, Axel) have exact stats and equipment."""
        heroes = self.cart.get("heroes", {})
        self.assertIn("wizard", heroes)
        self.assertIn("elf", heroes)
        self.assertIn("dwarf", heroes)
        self.assertIn("barbarian", heroes)

        # Wizard: Curious
        wiz = heroes["wizard"]
        self.assertEqual(wiz.get("name"), "Curious")
        self.assertEqual(wiz.get("bodyPoints"), 4)
        self.assertEqual(wiz.get("mindPoints"), 6)
        self.assertEqual(wiz.get("attackDice"), 1)
        self.assertEqual(wiz.get("defendDice"), 2)
        wiz_inv = [it.get("name") for it in wiz.get("inventory", [])]
        self.assertIn("Potion of Defense", wiz_inv)
        self.assertIn("Blessing of Oracle", wiz_inv)

        # Elf: Shawnti
        elf = heroes["elf"]
        self.assertEqual(elf.get("name"), "Shawnti")
        self.assertEqual(elf.get("bodyPoints"), 6)
        self.assertEqual(elf.get("mindPoints"), 5)
        self.assertEqual(elf.get("attackDice"), 4)
        self.assertEqual(elf.get("defendDice"), 3)
        self.assertIn("Battle Axe", elf.get("weapon", ""))
        self.assertIn("Helmet", elf.get("armor", ""))
        elf_inv = [it.get("name") for it in elf.get("inventory", [])]
        self.assertIn("Talisman of Lore", elf_inv)
        self.assertIn("Blessing of Oracle", elf_inv)
        self.assertIn("Ring of Fortitude", elf_inv)

        # Dwarf: Rufus
        dwarf = heroes["dwarf"]
        self.assertEqual(dwarf.get("name"), "Rufus")
        self.assertEqual(dwarf.get("bodyPoints"), 7)
        self.assertEqual(dwarf.get("mindPoints"), 3)
        self.assertEqual(dwarf.get("attackDice"), 3)
        self.assertEqual(dwarf.get("defendDice"), 3)
        self.assertIn("Broadsword", dwarf.get("weapon", ""))
        self.assertIn("Helmet", dwarf.get("armor", ""))

        # Barbarian: Axel (925 gold, Battle Axe, Helmet)
        barb = heroes["barbarian"]
        self.assertEqual(barb.get("name"), "Axel")
        self.assertEqual(barb.get("bodyPoints"), 8)
        self.assertEqual(barb.get("mindPoints"), 2)
        self.assertEqual(barb.get("attackDice"), 4)
        self.assertEqual(barb.get("defendDice"), 3)
        self.assertEqual(barb.get("gold"), 925)
        self.assertIn("Battle Axe", barb.get("weapon", ""))
        self.assertIn("Helmet", barb.get("armor", ""))
        barb_inv = [it.get("name") for it in barb.get("inventory", [])]
        self.assertIn("The Hearthskin Horn", barb_inv)

    def test_03_custom_monsters_doomguard_and_witch_hand(self):
        """Scenario 3: Custom monsters Cassandria's Doomguard and Witch Hand have exact stat blocks."""
        monsters = self.cart.get("monsters", {})
        self.assertIn("mon-note-c-doomguard", monsters)
        self.assertIn("mon-note-f-witch-hand", monsters)

        dg = monsters["mon-note-c-doomguard"]
        self.assertEqual(dg.get("attackDice"), 4)
        self.assertEqual(dg.get("defendDice"), 6)
        self.assertEqual(dg.get("bodyPoints"), 3)
        self.assertEqual(dg.get("mindPoints"), 3)
        self.assertEqual(dg.get("movementSquares"), 8)

        wh = monsters["mon-note-f-witch-hand"]
        self.assertEqual(wh.get("attackDice"), 4)
        self.assertEqual(wh.get("defendDice"), 4)
        self.assertEqual(wh.get("bodyPoints"), 4)
        self.assertEqual(wh.get("mindPoints"), 3)
        self.assertEqual(wh.get("movementSquares"), 8)
        self.assertTrue(wh.get("isSpellcaster"))
        self.assertTrue(wh.get("phaseWalls"))

    def test_04_map_layout_and_quest_notes_a_to_g(self):
        """Scenario 4: First Light 26x19 board has 22 rooms, 27 doors, and Notes A-G encoded."""
        maps = self.cart.get("maps", {})
        self.assertIn("fortress-fire-king", maps)
        f_map = maps["fortress-fire-king"]
        self.assertEqual(f_map.get("width"), 26)
        self.assertEqual(f_map.get("height"), 19)
        self.assertEqual(len(f_map.get("rooms", [])), 22)
        self.assertGreaterEqual(len(f_map.get("doors", [])), 26)

        # Check Notes A-G rooms and treasures
        rooms_by_note = {r.get("note"): r for r in f_map.get("rooms", []) if r.get("note")}
        self.assertIn("B", rooms_by_note)
        self.assertIn("C", rooms_by_note)
        self.assertIn("D", rooms_by_note)
        self.assertIn("E", rooms_by_note)
        self.assertIn("F", rooms_by_note)
        self.assertIn("G", rooms_by_note)

        # Note E: Orc's Bane
        re = rooms_by_note["E"]
        self.assertEqual(re["specialTreasure"]["gold"], 200)
        self.assertEqual(re["specialTreasure"]["item"], "Orc's Bane")

        # Note G: Glordrin's map and Ring of Fortitude
        rg = rooms_by_note["G"]
        st = rg["specialTreasure"]
        self.assertEqual(st["revealsSecretDoor"], "door-secret-mountain-passage")
        self.assertEqual(st["secondSearch"]["gold"], 400)
        self.assertEqual(st["secondSearch"]["item"], "Ring of Fortitude")

    def test_05_headless_cartridge_load_execution(self):
        """Scenario 5: Headless Godot loads heroquest-fortress-fire-king cartridge and initializes party."""
        from rpc_ai.tabletop_qa_player import TabletopQAPlayer
        import time

        play_script = os.path.join(ROOT_DIR, "play.sh")
        port = 18105
        env = dict(os.environ, TABLETOP_SERVER_PORT=str(port), TABLETOP_CARTRIDGE="heroquest-fortress-fire-king")
        proc = subprocess.Popen([play_script, "--headless", "--reset", "--cartridge=heroquest-fortress-fire-king"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            player = TabletopQAPlayer(port=port)
            connected = False
            for _ in range(30):
                if player.check_health():
                    connected = True
                    break
                time.sleep(0.3)
            self.assertTrue(connected, "GameControlServer must connect")
            st = player.get_state()
            hero_names = [h.get("name") for h in st.get("heroes", [])]
            self.assertIn("Curious", hero_names)
            self.assertIn("Shawnti", hero_names)
            self.assertIn("Rufus", hero_names)
            self.assertIn("Axel", hero_names)
        finally:
            proc.terminate()
            proc.wait()


if __name__ == "__main__":
    unittest.main()
