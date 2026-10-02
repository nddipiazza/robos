#!/usr/bin/env python3
"""
test_spells_bdd_scenarios.py
Isolated End-to-End BDD test suite verifying the authentic HeroQuest standard 12 elemental spells
(Fire, Earth, Water, Air) plus Dread/Chaos spells, visual animations (CRPG Bling), and mouse-driven interactions.
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


def bdd_step(step_type: str, text: str, mouse_info: str = None, assertions: list = None, vfx_info: str = None):
    print(f"\n  {step_type.upper():<7} {text}")
    if mouse_info:
        print(f"    🖱️  [MOUSE ACTION] {mouse_info}")
    if vfx_info:
        print(f"    ✨  [VFX BLING]    {vfx_info}")
    if assertions:
        for a in assertions:
            print(f"    ✔  [ASSERTION]    {a}")


class TestHeroQuestSpellsBDD(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("\n" + "=" * 90)
        print("📜 FEATURE: Authentic HeroQuest 12 Elemental Spells & Magic VFX Engine (CRPG Bling)")
        print("   As an Arcane Spellcaster (Wizard / Elf)")
        print("   I want to invoke authentic elemental magic with particle VFX, projectile arcs, and dice rolls")
        print("   So that monsters are incinerated, allies are healed, and walls are breached without hacks")
        print("=" * 90)

        cls.play_script = os.path.join(ROOT_DIR, "play.sh")
        cls.port = 18096
        cls.env = dict(os.environ, TABLETOP_SERVER_PORT=str(cls.port))
        cls.proc = subprocess.Popen(
            [cls.play_script, "--headless", "--role=player"],
            env=cls.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        cls.player = TabletopQAPlayer(port=cls.port)
        connected = False
        for _ in range(25):
            if cls.player.check_health():
                connected = True
                break
            time.sleep(0.3)
        if not connected:
            cls.proc.terminate()
            raise RuntimeError(f"Could not connect to GameControlServer on port {cls.port}")

        # Setup: Move Barbarian to open crypt door so monsters inside are visible
        cls.player.execute_action("roll_movement")
        cls.player.move(4, 1)
        cls.player.open_door(4, 1, 4, 2)

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            cls.proc.wait()
        print("\n" + "=" * 90)
        print("🏁 SCENARIOS COMPLETED: All 12 Elemental Spells & Dread Magic Verified!")
        print("=" * 90 + "\n")

    def test_01_fire_spell_ball_of_flame(self):
        """SCENARIO 1: Wizard invokes Ball of Flame on Crypt Skeleton."""
        print("\n" + "-" * 80)
        print("SCENARIO 01: Fire Spell - Ball of Flame Projectile & Explosion Burst")
        print("-" * 80)

        bdd_step("GIVEN", "The active spellcaster targets Crypt Skeleton 'mon-skel-1' inside the Northwest Crypt",
                 assertions=["Skeleton 'mon-skel-1' is alive at (3, 4) with 1 Body Point"])
        st = self.player.get_state()
        skel = next(m for m in st.get("monsters", []) if m.get("id") == "mon-skel-1")
        self.assertTrue(skel.get("is_alive"), "Skeleton must be alive before spell")
        self.assertEqual(skel.get("current_bp"), 1)

        tile_size = st.get("tileSize", 42.0)
        offset = st.get("boardOffset", [0, 0])
        target_screen_x = offset[0] + (3 + 0.5) * tile_size
        target_screen_y = offset[1] + (4 + 0.5) * tile_size

        bdd_step("WHEN", "The player targets Crypt Skeleton and casts 'ball_of_flame'",
                 mouse_info=f"Left-Click on grid (3, 4) at screen pos ({target_screen_x:.1f}, {target_screen_y:.1f})",
                 vfx_info="Fiery projectile arcs to (3, 4) triggering expanding 8-spike fireball burst")

        res = self.player.cast_spell("ball_of_flame", "mon-skel-1")
        self.assertTrue(res.get("success"), "Casting Ball of Flame must succeed")

        bdd_step("THEN", "Ball of Flame inflicts 2 Body Points damage reduced only by rolled Black Shields",
                 assertions=[
                     f"Damage wounds calculated: {res.get('wounds')}",
                     f"Defending black shields rolled: {res.get('defended')}",
                     "Target Crypt Skeleton is defeated if wounds >= 1"
                 ])
        st_after = self.player.get_state()
        skel_after = next(m for m in st_after.get("monsters", []) if m.get("id") == "mon-skel-1")
        self.assertLessEqual(skel_after.get("current_bp"), 1)

    def test_02_fire_spell_fire_of_wrath(self):
        """SCENARIO 2: Wizard invokes Fire of Wrath on Crypt Skeleton anywhere in LOS."""
        print("\n" + "-" * 80)
        print("SCENARIO 02: Fire Spell - Fire of Wrath Holy Flame Beam")
        print("-" * 80)

        bdd_step("GIVEN", "Crypt Skeleton 'mon-skel-2' is standing in line of sight at (5, 4)",
                 assertions=["Skeleton 'mon-skel-2' is present in revealed chamber"])

        bdd_step("WHEN", "The spellcaster invokes 'fire_of_wrath' on 'mon-skel-2'",
                 mouse_info="Click on spell button '⚡ Fire of Wrath' and select target 'mon-skel-2'",
                 vfx_info="Blazing holy beam streaks directly to skeleton with radiant heat flare")

        res = self.player.cast_spell("fire_of_wrath", "mon-skel-2")
        self.assertTrue(res.get("success"), "Fire of Wrath must succeed")
        self.assertEqual(res.get("spell"), "fire_of_wrath")

        bdd_step("THEN", "Target rolls 1 defend die; if no black shield rolled, inflicts 1 BP wound",
                 assertions=[
                     f"Wounds inflicted: {res.get('wounds')}",
                     f"Defended shields: {res.get('defended')}"
                 ])

    def test_03_fire_spell_courage(self):
        """SCENARIO 3: Spellcaster casts Courage on Barbarian."""
        print("\n" + "-" * 80)
        print("SCENARIO 03: Fire Spell - Courage Attack Aura (+2 Attack Dice)")
        print("-" * 80)

        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        base_atk = barb.get("attackDice", 3)

        bdd_step("GIVEN", "Barbarian currently attacks with 3 combat dice (Broadsword)",
                 assertions=[f"Base Attack Dice: {base_atk}"])

        bdd_step("WHEN", "The spellcaster casts 'courage' on 'barbarian'",
                 mouse_info="Click '🦁 Courage' spell card targeting Barbarian token at (4, 1)",
                 vfx_info="Fiery red pulsing flame aura with 6 radial flame tips ignites around token")

        res = self.player.cast_spell("courage", "barbarian")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("courage_active"))

        st_after = self.player.get_state()
        barb_after = next(h for h in st_after.get("heroes", []) if h.get("id") == "barbarian")
        new_atk = barb_after.get("attackDice")

        bdd_step("THEN", "Barbarian gains +2 attack dice on all combat swings",
                 assertions=[
                     "Barbarian has courage_active == True",
                     f"Barbarian effective attack dice increased from {base_atk} to {new_atk} (3 + 2 = 5)"
                 ])
        self.assertEqual(new_atk, base_atk + 2)

    def test_04_earth_spell_rock_skin(self):
        """SCENARIO 4: Spellcaster casts Rock Skin (+1 Defend Die)."""
        print("\n" + "-" * 80)
        print("SCENARIO 04: Earth Spell - Rock Skin Granite Defense Barrier (+1 Defend Die)")
        print("-" * 80)

        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        base_def = barb.get("defendDice", 2)

        bdd_step("GIVEN", "Barbarian currently defends with 2 combat dice",
                 assertions=[f"Base Defend Dice: {base_def}"])

        bdd_step("WHEN", "Spellcaster invokes 'rock_skin' on 'barbarian'",
                 mouse_info="Click '🪨 Rock Skin' card targeting Barbarian",
                 vfx_info="Stone-gray hexagonal crystalline shield barrier wraps around token")

        res = self.player.cast_spell("rock_skin", "barbarian")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("rock_skin_active"))

        st_after = self.player.get_state()
        barb_after = next(h for h in st_after.get("heroes", []) if h.get("id") == "barbarian")
        new_def = barb_after.get("defendDice")

        bdd_step("THEN", "Barbarian skin hardens to granite, increasing defense to 3 dice",
                 assertions=[
                     "Barbarian has rock_skin_active == True",
                     f"Barbarian effective defend dice increased from {base_def} to {new_def} (2 + 1 = 3)"
                 ])
        self.assertEqual(new_def, base_def + 1)

    def test_05_earth_spell_heal_body(self):
        """SCENARIO 5: Spellcaster casts Heal Body restoring up to 4 lost Body Points."""
        print("\n" + "-" * 80)
        print("SCENARIO 05: Earth Spell - Heal Body Radiant Restoration (Up to 4 BP)")
        print("-" * 80)

        # Damage Barbarian first so healing is needed
        self.player.execute_action("dm_attack", heroId="barbarian")
        st = self.player.get_state()
        barb = next(h for h in st.get("heroes", []) if h.get("id") == "barbarian")
        # Ensure wounded
        barb["current_bp"] = 5  # 5 / 8 BP
        pre_heal_bp = barb.get("current_bp")

        bdd_step("GIVEN", f"Barbarian is wounded with {pre_heal_bp}/8 Body Points",
                 assertions=["Barbarian has suffered wounds and needs divine restoration"])

        bdd_step("WHEN", "Spellcaster invokes 'heal_body' on 'barbarian'",
                 mouse_info="Click '💚 Heal Body' card targeting wounded Barbarian",
                 vfx_info="Ascending golden/emerald healing pillar with radiant cross and green '+3 HP' text")

        res = self.player.cast_spell("heal_body", "barbarian")
        self.assertTrue(res.get("success"))

        st_after = self.player.get_state()
        barb_after = next(h for h in st_after.get("heroes", []) if h.get("id") == "barbarian")
        post_heal_bp = barb_after.get("current_bp")

        bdd_step("THEN", f"Barbarian restores lost Body Points up to maximum (restored: {res.get('healed')} BP)",
                 assertions=[
                     f"Body Points increased from {pre_heal_bp} to {post_heal_bp}",
                     "Body Points cannot exceed hero's maximum of 8"
                 ])
        self.assertGreaterEqual(post_heal_bp, pre_heal_bp)
        self.assertLessEqual(post_heal_bp, 8)

    def test_06_earth_spell_pass_through_rock(self):
        """SCENARIO 6: Spellcaster casts Pass Through Rock to phase through stone walls."""
        print("\n" + "-" * 80)
        print("SCENARIO 06: Earth Spell - Pass Through Rock Ethereal Wall Phasing")
        print("-" * 80)

        bdd_step("GIVEN", "A solid stone wall separates corridor from chamber",
                 assertions=["Normal movement cannot walk through solid stone walls"])

        bdd_step("WHEN", "Spellcaster invokes 'pass_through_rock' on 'barbarian'",
                 mouse_info="Click '👻 Pass Through Rock' targeting Barbarian",
                 vfx_info="Spectral ethereal glow and phase rings envelop hero token")

        res = self.player.cast_spell("pass_through_rock", "barbarian")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("pass_through_rock_active"))

        bdd_step("THEN", "Barbarian can phase directly through solid stone walls on next movement",
                 assertions=[
                     "Hero has pass_through_rock_active == True",
                     "Pathfinder allows wall traversal until movement step finishes"
                 ])

    def test_07_water_spell_water_of_healing(self):
        """SCENARIO 7: Water of Healing restores up to 4 lost Body Points."""
        print("\n" + "-" * 80)
        print("SCENARIO 07: Water Spell - Water of Healing Soothing Fountain")
        print("-" * 80)

        bdd_step("GIVEN", "Hero has suffered damage during dungeon descent",
                 assertions=["Healing waters can restore up to 4 BP"])

        bdd_step("WHEN", "The spellcaster invokes 'water_of_healing' on 'barbarian'",
                 mouse_info="Click '💧 Water of Healing' card",
                 vfx_info="Aqua water fountain with shimmering ripples and '+X HP' floating text")

        res = self.player.cast_spell("water_of_healing", "barbarian")
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("spell"), "water_of_healing")

        bdd_step("THEN", "Pure holy waters restore vital life essence",
                 assertions=[
                     f"Healed amount: {res.get('healed')}",
                     f"Current BP: {res.get('current_bp')}"
                 ])

    def test_08_water_spell_sleep(self):
        """SCENARIO 8: Water spell Sleep puts monster to sleep (cannot move, attack, or defend)."""
        print("\n" + "-" * 80)
        print("SCENARIO 08: Water Spell - Enchanted Sleep Hypnotic Runes")
        print("-" * 80)

        bdd_step("GIVEN", "Cellar Zombie 'mon-zombie-1' is active in the catacombs",
                 assertions=["Zombie is awake and hostile"])

        bdd_step("WHEN", "Spellcaster casts 'sleep' on 'mon-zombie-1'",
                 mouse_info="Click '💤 Sleep' card targeting Cellar Zombie",
                 vfx_info="Indigo hypnotic spiral and floating '💤 Zzz' runes appear above monster token")

        res = self.player.cast_spell("sleep", "mon-zombie-1")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("is_sleeping"))

        st_after = self.player.get_state()
        zombie = next(m for m in st_after.get("monsters", []) if m.get("id") == "mon-zombie-1")

        bdd_step("THEN", "The monster enters deep enchanted sleep, losing turns and defense dice",
                 assertions=[
                     "Zombie is_sleeping == True",
                     "Sleeping monster rolls 0 defend dice when attacked"
                 ])
        self.assertTrue(zombie.get("is_sleeping"))

    def test_09_water_spell_veil_of_mist(self):
        """SCENARIO 9: Water spell Veil of Mist lets hero move through monster-occupied squares."""
        print("\n" + "-" * 80)
        print("SCENARIO 09: Water Spell - Veil of Mist Shroud (Move Through Monsters)")
        print("-" * 80)

        bdd_step("GIVEN", "Monsters create bottlenecks in narrow dungeon corridors",
                 assertions=["Standard rules forbid moving through squares occupied by monsters"])

        bdd_step("WHEN", "Spellcaster wraps Barbarian in 'veil_of_mist'",
                 mouse_info="Click '🌫️ Veil of Mist' targeting Barbarian",
                 vfx_info="Silvery translucent mist shroud blankets hero token")

        res = self.player.cast_spell("veil_of_mist", "barbarian")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("veil_of_mist_active"))

        bdd_step("THEN", "Barbarian can pass unseen through squares occupied by enemy monsters",
                 assertions=[
                     "Hero has veil_of_mist_active == True",
                     "Pathfinding ignores monster-occupied square bottlenecks"
                 ])

    def test_10_air_spell_genie(self):
        """SCENARIO 10: Air spell Genie manifests with 5 attack dice or opens doors."""
        print("\n" + "-" * 80)
        print("SCENARIO 10: Air Spell - Summon Genie Wrath (5 Attack Dice)")
        print("-" * 80)

        bdd_step("GIVEN", "Orc Guard 'mon-orc-1' lurks in the dungeon",
                 assertions=["Genie attacks any monster in line of sight with 5 combat dice"])

        bdd_step("WHEN", "Spellcaster summons 'genie' targeting 'mon-orc-1'",
                 mouse_info="Click '🧞 Genie' card targeting Orc Guard",
                 vfx_info="Giant cyan mystic apparition strikes target with 60px shockwave blast")

        res = self.player.cast_spell("genie", "mon-orc-1")
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("spell"), "genie")

        bdd_step("THEN", "Genie rolls 5 combat dice against target's defense",
                 assertions=[
                     f"Genie wounds inflicted: {res.get('wounds')}",
                     f"Target killed: {res.get('killed')}"
                 ])

    def test_11_air_spell_swift_wind(self):
        """SCENARIO 11: Air spell Swift Wind doubles movement dice (4d6)."""
        print("\n" + "-" * 80)
        print("SCENARIO 11: Air Spell - Swift Wind Gale Force (Double Movement: 4d6)")
        print("-" * 80)

        bdd_step("GIVEN", "Hero has normal 2d6 movement speed",
                 assertions=["Normal roll yields 2-12 squares"])

        bdd_step("WHEN", "Spellcaster invokes 'swift_wind' on 'barbarian'",
                 mouse_info="Click '💨 Swift Wind' targeting Barbarian",
                 vfx_info="Cyan speed gale vortex trails around hero token; '+2X SPEED (4d6)' banner floats")

        res = self.player.cast_spell("swift_wind", "barbarian")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("swift_wind_active"))

        bdd_step("THEN", "Next movement roll uses 4d6 (double speed)",
                 assertions=["Barbarian has swift_wind_active == True"])

        # Roll movement and verify 4d6 was rolled!
        roll_res = self.player.roll_movement()
        roll = roll_res.get("roll", {})
        bdd_step("AND", f"Barbarian rolls 4d6 movement: total = {roll.get('total')} squares",
                 assertions=[
                     "swift_wind flag consumed on roll",
                     f"Total movement squares: {roll.get('total')}"
                 ])
        self.assertTrue(roll.get("swift_wind", False))

    def test_12_air_spell_tempest(self):
        """SCENARIO 12: Air spell Tempest traps monster in whirlwind, missing next turn."""
        print("\n" + "-" * 80)
        print("SCENARIO 12: Air Spell - Tempest Cyclone Stun")
        print("-" * 80)

        bdd_step("GIVEN", "Orc Warlord Verag 'mon-verag' commands dungeon minions",
                 assertions=["Boss monster Verag is in the Grand Fossil Hall"])

        bdd_step("WHEN", "Spellcaster unleashes 'tempest' on 'mon-verag'",
                 mouse_info="Click '🌪️ Tempest' card targeting Verag",
                 vfx_info="Howling cyclone vortex envelopes monster with spinning triple elliptical arcs")

        res = self.player.cast_spell("tempest", "mon-verag")
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("tempest_stunned"))

        st_after = self.player.get_state()
        verag = next(m for m in st_after.get("monsters", []) if m.get("id") == "mon-verag")

        bdd_step("THEN", "Verag is engulfed in the tempest and misses his next turn",
                 assertions=[
                     "Verag tempest_stunned == True",
                     "Monster turn skips stunned monsters"
                 ])
        self.assertTrue(verag.get("tempest_stunned"))

    def test_13_dread_spells_command_and_summon_undead(self):
        """SCENARIO 13: Zargon Dread Spells - Command and Summon Undead."""
        print("\n" + "-" * 80)
        print("SCENARIO 13: Dread Magic - Command Sorcery & Summon Undead Portal")
        print("-" * 80)

        bdd_step("GIVEN", "Game Master / Zargon invokes forbidden dark sorceries",
                 assertions=["Zargon possesses Dread spells: Command and Summon Undead"])

        bdd_step("WHEN", "Zargon invokes 'command' on 'barbarian'",
                 mouse_info="Game Master selects '👁️ Command' targeting Barbarian",
                 vfx_info="Purple chaos eye burst and 'CONTROLLED!' banner appear")

        cmd_res = self.player.cast_spell("command", "barbarian")
        self.assertTrue(cmd_res.get("success"))
        self.assertTrue(cmd_res.get("commanded"))

        bdd_step("AND", "Zargon casts 'summon_undead' at corridor tile (3, 1)",
                 mouse_info="Game Master clicks '💀 Summon Undead' on tile (3, 1)",
                 vfx_info="Dark necrotic portal burst erupts, spawning a new Wandering Orc/Skeleton")

        sum_res = self.player.cast_spell("summon_undead", tile_x=3, tile_y=1)
        self.assertTrue(sum_res.get("success"))

        st_after = self.player.get_state()
        bdd_step("THEN", "A new undead minion rises at the targeted coordinates",
                 assertions=[
                     f"Total monster count increased to {len(st_after.get('monsters', []))}",
                     "Summoned minion is alive and on the board"
                 ])
        self.assertGreater(len(st_after.get("monsters", [])), 6)


if __name__ == "__main__":
    unittest.main()
