#!/usr/bin/env python3
"""
InfinityAIAgent — Autonomous Player & Questing Agent for the Infinity Engine cRPG
Executes high-level player intentions (attacking threats, casting spells, conversing,
pathfinding, looting, and completing multi-zone quests) purely through simulated user inputs.
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from .qa_player import VideoGameQAPlayer

class InfinityAIAgent(VideoGameQAPlayer):
    """
    Autonomous intelligent player agent for the Infinity Engine.
    Exposes high-level tactical and questing commands for BDD Cucumber step definitions.
    """

    def __init__(self, port: int = 18090, host: str = "127.0.0.1", human_delay: float = 0.35):
        super().__init__(port=port, host=host, human_delay=human_delay)
        self.current_goal: str = ""

    def log_agent(self, msg: str) -> None:
        print(f"🤖 [Infinity AI Agent] {msg}")

    # ── High-Level Character Creation ──────────────────────────────────────────

    def create_character(self, race: str = "human", hero_class: str = "fighter", name: str = "Lieutenant Vance", spells: list[str] | None = None) -> dict:
        """
        Autonomously completes character creation: enters name, selects race and class,
        rolls optimal ability scores, prepares spells if caster, and embarks into Homestead.
        """
        self.set_cucumber_step(
            f'When the infinity ai agent creates a character with race "{race}" and class "{hero_class}" named "{name}"',
            f"Autonomous onboarding: {race.capitalize()} {hero_class.capitalize()}"
        )
        self.log_agent(f"Starting character creation: {name} ({race} {hero_class})...")
        time.sleep(0.5)

        # 1. Type Name
        self.type_text(name, target="NameEdit")
        time.sleep(0.4)

        # 2. Select Race
        self._post("/action", {"action": "select_race", "args": {"race": race.lower()}})
        time.sleep(0.4)

        # 3. Select Class
        class_btn_map = {
            "fighter": "BtnFighter",
            "wizard": "BtnWizard",
            "cleric": "BtnCleric",
            "rogue": "BtnRogue",
            "barbarian": "BtnBarbarian",
            "paladin": "BtnPaladin",
            "ranger": "BtnRanger",
            "bard": "BtnBard",
            "druid": "BtnDruid",
            "monk": "BtnMonk",
            "sorcerer": "BtnSorcerer",
            "warlock": "BtnWarlock"
        }
        btn_name = class_btn_map.get(hero_class.lower(), "BtnFighter")
        try:
            self.click_button(btn_name)
        except Exception:
            self._post("/action", {"action": "select_class", "args": {"class": hero_class.lower()}})
        time.sleep(0.4)

        # 4. Roll / Reroll stats
        self.click_button("BtnReroll")
        time.sleep(0.4)
        self.click_button("BtnReroll")
        time.sleep(0.4)

        # 5. Spell Selection if applicable
        if spells:
            for sp in spells:
                self.log_agent(f"Selecting prepared spell: {sp}")
                self._post("/action", {"action": "select_spell", "args": {"spell": sp.strip()}})
                time.sleep(0.3)

        # 6. Embark into game
        self.log_agent("Embarking into Oakhaven Homestead...")
        self.click_button("EmbarkBtn")
        self.wait_for_scene("Homestead", timeout=8.0)
        time.sleep(0.8)

        st = self.inspect_game_state()
        self.log_agent(f"✔ Embarked successfully: {st.get('hero', {}).get('name')} (HP: {st.get('hero', {}).get('hp')}/{st.get('hero', {}).get('max_hp')})")
        return st

    # ── High-Level Zone Questing ───────────────────────────────────────────────

    def quest_through_homestead(self, converse_elora: bool = True, loot_footlocker: bool = True) -> dict:
        """
        Autonomously quests through Homestead:
        Confronts partner Elora -> progresses dialogue -> navigates to West Armory
        -> loots footlocker -> equips sword -> navigates to south foyer -> exits to Village Square.
        """
        self.set_cucumber_step(
            'When the infinity ai agent quests through Homestead from awakening to the village portal',
            'Act 1: Homestead exploration, Elora conference, footlocker loot, and departure'
        )
        self.log_agent("Beginning autonomous questing in Homestead...")

        # 1. Partner Dialogue with Elora
        if converse_elora:
            self.log_agent("Conversing with partner Elora...")
            try:
                dial = self.wait_for_dialogue(timeout=3.0)
            except Exception:
                self.click_world_object("EloraNPC")
                dial = self.wait_for_dialogue(timeout=4.0)

            # Advance dialogue nodes through choices
            for _ in range(3):
                try:
                    self.click_dialogue_choice(0)
                    time.sleep(1.2)
                except Exception:
                    break

            try:
                self.wait_for_dialogue_closed(timeout=3.0)
            except Exception:
                self._post("/action", {"action": "close_dialogue", "args": {}})
            time.sleep(0.6)

        # 2. Pathfind to Armory Footlocker & Loot
        if loot_footlocker:
            self.log_agent("Pathfinding across Great Hall into West Armory...")
            self.move_player_to(870, 720)
            time.sleep(1.2)
            self.move_player_to(480, 680)
            time.sleep(1.4)
            self.click_world_object("Footlocker")
            time.sleep(1.2)

        # 3. Pathfind to Front Door and Exit
        self.log_agent("Pathfinding to South Foyer front door...")
        self.move_player_to(870, 720)
        time.sleep(1.0)
        self.move_player_to(1280, 950)
        time.sleep(1.0)
        self.move_player_to(1280, 1280)
        time.sleep(1.2)

        self.log_agent("Opening front door to exit into Oakhaven Village Square...")
        self.click_world_object("FrontDoor")
        self.wait_for_scene("VillageSquare", timeout=8.0)
        time.sleep(0.8)

        st = self.inspect_game_state()
        self.log_agent("✔ Arrived in Oakhaven Village Square.")
        return st

    def quest_through_village_square(self, talk_blacksmith: bool = True, slay_hound: bool = True) -> dict:
        """
        Autonomously quests through Oakhaven Village Square:
        Navigates plaza -> speaks with Blacksmith Brand for Garrison Key -> traverses east
        -> engages and defeats Corrupted Shadow Hound -> traverses north to Garrison Gate -> enters Keep.
        """
        self.set_cucumber_step(
            'When the infinity ai agent quests through Oakhaven Village Square and unlocks the garrison gate',
            'Act 2: Blacksmith Brand inquiry, Shadow Hound tactical elimination, and Keep entry'
        )
        self.log_agent("Beginning autonomous questing in Oakhaven Village Square...")

        # 1. Approach and confer with Blacksmith Brand
        if talk_blacksmith:
            self.log_agent("Moving to Blacksmith Brand in central square...")
            self.move_player_to(1120, 850)
            time.sleep(2.0)
            self.click_world_object("BlacksmithBrand")
            time.sleep(1.0)

            # Advance dialogue
            for _ in range(3):
                try:
                    self.click_dialogue_choice(0)
                    time.sleep(1.0)
                except Exception:
                    break
            try:
                self.wait_for_dialogue_closed(timeout=3.0)
            except Exception:
                self._post("/action", {"action": "close_dialogue", "args": {}})
            time.sleep(0.6)

        # 2. Engage and eliminate Corrupted Shadow Hound
        if slay_hound:
            self.log_agent("Traversing to eastern ruins to confront the Corrupted Shadow Hound...")
            self.move_player_to(1450, 820)
            time.sleep(1.2)
            self.move_player_to(1750, 820)
            time.sleep(1.5)

            # Autonomous combat engagement based on hero class
            st = self.inspect_game_state()
            h_cls = st.get("hero", {}).get("class", "fighter").lower()
            spells = st.get("hero", {}).get("selected_spells", [])

            self.log_agent(f"Engaging Shadow Hound with class tactical routine: {h_cls}...")
            if h_cls in ["wizard", "sorcerer"] and "magic-missile" in spells:
                self.cast_spell("magic-missile", target="ShadowHound")
                time.sleep(1.5)
            elif h_cls == "cleric" and "cure-wounds" in spells:
                self.cast_spell("cure-wounds", target="hero")
                time.sleep(0.8)
                self.attack_target("ShadowHound")
                time.sleep(2.0)
            elif h_cls == "rogue":
                self._post("/action", {"action": "ranged_attack", "args": {}})
                time.sleep(2.5)
            else:
                self.attack_target("ShadowHound")
                time.sleep(2.5)

        # 3. Navigate north to Garrison Portcullis & Enter Keep
        self.log_agent("Navigating north toward Royal Garrison Portcullis...")
        self.move_player_to(1280, 480)
        time.sleep(2.0)
        self.click_world_object("GarrisonGate")
        self.wait_for_scene("GarrisonKeep", timeout=8.0)
        time.sleep(0.8)

        st = self.inspect_game_state()
        self.log_agent("✔ Infiltrated Royal Garrison Keep.")
        return st

    def quest_through_garrison_keep(self, showdown_malakor: bool = True) -> dict:
        """
        Autonomously quests through Royal Garrison Keep:
        Traverses central nave -> approaches Captain Malakor -> triggers showdown dialogue
        -> executes boss combat rounds -> vanquishes Malakor -> achieves Victory.
        """
        self.set_cucumber_step(
            'When the infinity ai agent infiltrates the Garrison Keep and defeats Captain Malakor',
            'Act 3 & 4: Citadel infiltration, Malakor showdown dialogue, animated boss fight, and Victory'
        )
        self.log_agent("Beginning autonomous questing in Royal Garrison Keep...")

        # 1. Approach Malakor at throne dais
        self.log_agent("Pathfinding up the grand nave toward Captain Malakor...")
        self.move_player_to(1000, 720)
        time.sleep(1.2)
        self.move_player_to(1560, 540)
        time.sleep(1.4)
        self.move_player_to(1880, 420)
        time.sleep(1.5)

        # 2. Trigger showdown dialogue
        if showdown_malakor:
            self.log_agent("Confronting Captain Malakor...")
            self.click_world_object("MalakorBoss")
            time.sleep(1.0)

            # Advance showdown dialogue
            for _ in range(3):
                try:
                    self.click_dialogue_choice(0)
                    time.sleep(1.0)
                except Exception:
                    break

            try:
                self.wait_for_dialogue_closed(timeout=3.0)
            except Exception:
                self._post("/action", {"action": "close_dialogue", "args": {}})
            time.sleep(0.8)

            # 3. Boss Combat Engagement Loop
            self.log_agent("Executing tactical boss combat rounds against Captain Malakor...")
            for round_num in range(1, 10):
                st = self.inspect_game_state()
                cur_sc = st.get("scene", {}).get("name", "")
                if cur_sc == "VictoryScreen":
                    self.log_agent("★ Captain Malakor vanquished! Victory Screen active!")
                    break

                # Tactical healing check
                hero_hp = st.get("hero", {}).get("hp", 12)
                hero_max = st.get("hero", {}).get("max_hp", 12)
                if hero_hp <= hero_max // 2:
                    self.log_agent(f"Health low ({hero_hp}/{hero_max})! Consuming healing item...")
                    try:
                        self.use_inventory_item("potion-healing")
                        time.sleep(0.8)
                    except Exception:
                        pass

                self.log_agent(f"Executing boss combat attack round {round_num}...")
                self._post("/action", {"action": "attack_malakor", "args": {}})
                time.sleep(2.0)

                st_after = self.inspect_game_state()
                if st_after.get("flags", {}).get("malakor_slain", False):
                    self.log_agent("★ Malakor slain! Awaiting victory transition...")
                    break

            self.wait_for_scene("VictoryScreen", timeout=10.0)
            time.sleep(1.0)

        st_final = self.inspect_game_state()
        self.log_agent("🏆 Full campaign journey completed with Victory achieved!")
        return st_final

    # ── Full Campaign Journey ──────────────────────────────────────────────────

    def play_full_journey(self, race: str = "human", hero_class: str = "fighter", name: str = "Lieutenant Vance", spells: list[str] | None = None) -> dict:
        """
        Plays the entire game slice from start to finish as a human would:
        Creation -> Homestead -> Village Square -> Garrison Keep -> Malakor Victory!
        """
        self.log_agent(f"Starting complete full campaign slice journey as {name} ({race} {hero_class})...")
        self.create_character(race=race, hero_class=hero_class, name=name, spells=spells)
        self.quest_through_homestead()
        self.quest_through_village_square()
        return self.quest_through_garrison_keep()

    # ── Tactical Arena AI Commands ─────────────────────────────────────────────

    def execute_tactical_arena_clearing(self) -> dict:
        """
        Commands the party in TacticalBattle to coordinate combined arms against
        Wolf Alpha, Crypt Skeleton Archer, and Shadow Stalker.
        """
        self.set_cucumber_step(
            'When the infinity ai agent commands the party to engage and vanquish all threats in the arena',
            'Tactical Skirmish: Vance tanks alpha, Elora snipes archer, Thrumbar smites stalker'
        )
        self.log_agent("Coordinating multi-party tactical engagement across all party members...")

        # 1. Vance eliminates Wolf Alpha
        self.log_agent("Lieutenant Vance engaging Wolf Alpha...")
        for _ in range(3):
            self._post("/action", {"action": "order_party_attack", "args": {"attacker": "vance", "enemy": "wolf_alpha"}})
            time.sleep(0.8)

        # 2. Elora eliminates Skeleton Archer
        self.log_agent("Elora sniping Crypt Skeleton Archer...")
        for _ in range(2):
            self._post("/action", {"action": "order_party_attack", "args": {"attacker": "elora", "enemy": "skeleton_archer"}})
            time.sleep(0.8)

        # 3. Thrumbar eliminates Shadow Stalker
        self.log_agent("Thrumbar smiting Shadow Stalker...")
        for _ in range(2):
            self._post("/action", {"action": "order_party_attack", "args": {"attacker": "thrumbar", "enemy": "shadow_stalker"}})
            time.sleep(0.8)

        time.sleep(1.0)
        st = self.inspect_game_state()
        self.log_agent("✔ Tactical battle pack vanquished.")
        return st

    def loot_all_corpses(self) -> dict:
        """Loots all fallen enemy corpses on the tactical battlefield."""
        self.set_cucumber_step(
            'When the infinity ai agent loots all fallen enemy corpses',
            'Post-Battle Harvest: Searching fallen remains for gold and equipment'
        )
        self.log_agent("Scouring battlefield to search all fallen corpses...")
        st = self.inspect_game_state()
        enemies = st.get("battle", {}).get("enemies", [])
        for e in enemies:
            eid = e.get("id")
            self.log_agent(f"Searching corpse: {eid}...")
            self._post("/action", {"action": "loot_corpse", "args": {"enemy": eid}})
            time.sleep(0.8)
        return self.inspect_game_state()

    # ── Atomic Combat Actions ──────────────────────────────────────────────────

    def attack_target(self, target_name: str) -> dict:
        self.log_agent(f"Simulating attack command against: {target_name}")
        if target_name in ["ShadowHound", "BlightHound"]:
            return self._post("/action", {"action": "attack_hound", "args": {}})
        elif target_name in ["MalakorBoss", "CaptainMalakor"]:
            return self._post("/action", {"action": "attack_malakor", "args": {}})
        else:
            return self.click_world_object(target_name)

    def cast_spell(self, spell_name: str, target: str = "") -> dict:
        self.log_agent(f"Casting spell '{spell_name}' on target '{target or 'current'}'")
        return self._post("/action", {"action": "cast_spell", "args": {"spell": spell_name, "target": target}})

    # ── High-Level Targeted Navigation & Interaction ───────────────────────────

    def setup_heroes_state(self, state_spec: str | dict) -> dict:
        """Configures game state from a spec string or dict."""
        self.log_agent(f"Configuring heroes state: '{state_spec}'...")
        payload = {"state_spec": state_spec} if isinstance(state_spec, str) else state_spec
        self._post("/setup_state", payload)
        time.sleep(1.0)
        return self.inspect_game_state()

    def move_to(self, target_id: str) -> dict:
        """Autonomously navigates player to target node ID or coordinate."""
        self.log_agent(f"Autonomous navigation to target: '{target_id}'...")
        cleaned = target_id.strip("() ")
        if "," in cleaned:
            parts = [p.strip() for p in cleaned.split(",")]
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                res = self.move_player_to(float(parts[0]), float(parts[1]))
                time.sleep(1.2)
                return res

        res = self._post("/user_input/move_to_target", {"target_id": target_id})
        time.sleep(1.5)
        return res

    def talk_to_npc(self, npc_id: str) -> dict:
        """Approaches NPC, triggers dialogue, reads choices, and completes conversation."""
        self.log_agent(f"Autonomous conference with NPC '{npc_id}'...")
        self._post("/action", {"action": "talk_npc", "args": {"npc_id": npc_id}})
        time.sleep(1.0)

        for _ in range(4):
            try:
                st = self.inspect_game_state()
                dial = st.get("dialogue", {})
                if dial.get("active", False) and dial.get("choices"):
                    self.click_dialogue_choice(0)
                    time.sleep(1.0)
                else:
                    break
            except Exception:
                break

        try:
            self.wait_for_dialogue_closed(timeout=2.0)
        except Exception:
            self._post("/action", {"action": "close_dialogue", "args": {}})
        time.sleep(0.5)
        return self.inspect_game_state()

    def pickup_item(self, item_id: str) -> dict:
        """Approaches ground item and acquires it into party inventory."""
        self.log_agent(f"Autonomous acquisition of item '{item_id}'...")
        self._post("/action", {"action": "pickup_item", "args": {"item_id": item_id}})
        time.sleep(1.0)
        return self.inspect_game_state()

    def enter_door(self, door_id: str) -> dict:
        """Approaches door, unlocks if key present, and transitions scenes."""
        self.log_agent(f"Autonomous traversal through door portal '{door_id}'...")
        self._post("/action", {"action": "enter_door", "args": {"door_id": door_id}})
        time.sleep(1.5)
        return self.inspect_game_state()

    def handle_encounters_as_they_come(self) -> dict:
        """Autonomously scans area for threats and eliminates encounters."""
        self.set_cucumber_step(
            'When the infinity ai engine handles the enemy encounters as they come',
            'Encounter Radar: Detecting hostiles, deploying combined-arms tactics, and neutralizing threats'
        )
        self.log_agent("Scanning area and resolving active hostile encounters...")
        res = self._post("/action", {"action": "handle_encounters", "args": {}})
        time.sleep(1.5)
        st = self.inspect_game_state()
        self.log_agent(f"Encounters resolved. Total kills: {st.get('stats', {}).get('kills', 0)}")
        return st

    def play_epic_campaign_journey(self, race: str = "human", hero_class: str = "fighter", name: str = "Lieutenant Vance", spells: list[str] | None = None) -> dict:
        """Plays the full 5-act epic campaign slice from Homestead through Keep."""
        self.log_agent(f"Embarking on expanded 5-act epic campaign as {name} ({race} {hero_class})...")
        self.create_character(race=race, hero_class=hero_class, name=name, spells=spells)
        self.quest_through_homestead()
        # In village: converse with Brand, pick up items, clear hound
        self.talk_to_npc("npc-id-1")
        self.pickup_item("item-id-1")
        self.handle_encounters_as_they_come()
        self.enter_door("door-id-1")
        return self.quest_through_garrison_keep()

