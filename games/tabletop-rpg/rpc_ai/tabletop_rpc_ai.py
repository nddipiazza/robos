#!/usr/bin/env python3
"""
TabletopRPCAI — Autonomous Player and Dungeon Master Agent for Tabletop RPG
Builds on TabletopQAPlayer to drive complete turn lifecycles:
rolling dice, corridor navigation, opening doors, revealing fog of war,
resolving HeroQuest combat, treasure searching, and AI monster retaliation.
"""

from __future__ import annotations

import json
import time
from .tabletop_qa_player import TabletopQAPlayer


class TabletopRPCAI(TabletopQAPlayer):
    def __init__(self, port: int = 18092, host: str = "127.0.0.1", human_delay: float = 0.4):
        super().__init__(port=port, host=host, human_delay=human_delay)

    def log_ai(self, msg: str) -> None:
        print(f"🤖 [Tabletop RPC AI] {msg}")

    def play_hero_advance(
        self,
        target_door: tuple[tuple[int, int], tuple[int, int]],
        room_target: tuple[int, int],
        attack_monster: bool = True
    ) -> dict:
        """
        Executes a complete hero action sequence:
        1. Rolls 2d6 movement dice
        2. Advances to the door
        3. Kicks open the door, clearing Fog of War
        4. Steps into the chamber
        5. Attacks adjacent monster if present
        6. Ends turn
        """
        self.log_ai("--- Starting Hero Turn ---")
        
        # 1. Roll movement
        roll_res = self.roll_movement()
        time.sleep(self.human_delay)

        # 2. Advance to door
        (door_from, door_to) = target_door
        self.log_ai(f"Moving to door tile at ({door_from[0]}, {door_from[1]})...")
        self.move(door_from[0], door_from[1])
        time.sleep(self.human_delay)

        # 3. Kick open door
        self.log_ai(f"Kicking open door: Fog of War lifts!")
        door_res = self.open_door(door_from[0], door_from[1], door_to[0], door_to[1])
        time.sleep(self.human_delay)

        # 4. Enter room
        self.log_ai(f"Striding into revealed chamber at ({room_target[0]}, {room_target[1]})...")
        self.move(room_target[0], room_target[1])
        time.sleep(self.human_delay)

        # 5. Attack if requested
        if attack_monster:
            self.log_ai("Engaging enemy monster in melee combat!")
            atk_res = self.attack()
            time.sleep(self.human_delay)

        # 6. End turn
        self.log_ai("Hero turn complete. Ending turn.")
        self.end_turn()
        time.sleep(self.human_delay)

        return {
            "success": True,
            "roll": roll_res,
            "door": door_res,
            "state": self.get_state()
        }

    def play_search_turn(self, target_tile: tuple[int, int]) -> dict:
        """
        Executes a second hero's turn:
        1. Rolls 2d6 movement
        2. Advances into the revealed chamber
        3. Searches for treasure
        4. Ends turn
        """
        self.log_ai("--- Starting Companion Hero Turn ---")
        self.roll_movement()
        time.sleep(self.human_delay)

        self.log_ai(f"Companion hero advances into room at ({target_tile[0]}, {target_tile[1]})...")
        self.move(target_tile[0], target_tile[1])
        time.sleep(self.human_delay)

        self.log_ai("Searching room for ancient artifacts and chests...")
        search_res = self.search()
        time.sleep(self.human_delay)

        self.log_ai("Companion hero concludes turn.")
        self.end_turn()
        time.sleep(self.human_delay)

        return search_res

    def play_monster_phase(self) -> dict:
        """
        Executes the Game Master / Zargon monster phase:
        Triggers monster AI to detect heroes, step forward, and attack.
        """
        self.log_ai("=== Executing Zargon / Monster AI Phase ===")
        res = self.monster_turn()
        time.sleep(self.human_delay)
        return res

    def run_first_exploration_scenario(self) -> dict:
        """
        Runs the full first-entry dungeon exploration scenario:
        - Verify initial heroes at stairwell and Fog of War covering rooms
        - Barbarian rolls 2d6, advances down corridor, opens door to Northwest Crypt
        - Fog of War lifts, revealing chamber, tomb, and Crypt Skeleton
        - Barbarian attacks with Broadsword (rolls Skulls vs Shields)
        - Dwarf rolls 2d6, steps in, searches for treasure (discovers Gold Coins)
        - Hero phase ends; Zargon Monster AI phase triggers and enemy retaliates
        - Round 2 begins: full turn cycle complete
        """
        self.log_ai("🛡️ [Scenario] Beginning First-Entry Exploration Playthrough...")
        
        st = self.get_state()
        self.log_ai(f"Initial State: Round {st.get('round')}, Phase: {st.get('phase')}, Active: {st.get('activeHero')}")
        self.log_ai(f"Revealed Rooms: {st.get('revealedRooms')}")

        # Step 1: Barbarian explores and opens crypt door
        self.play_hero_advance(
            target_door=((4, 1), (4, 2)),
            room_target=(4, 3),
            attack_monster=True
        )

        st = self.get_state()
        self.log_ai(f"After Barbarian Action: Revealed Rooms: {st.get('revealedRooms')}")

        # Step 2: Dwarf enters and searches
        self.play_search_turn(target_tile=(3, 3))

        # Conclude any remaining heroes to initiate GM phase
        st = self.get_state()
        while st.get("phase") == "hero_phase" and st.get("activeHeroIndex", 0) != 0:
            self.log_ai(f"Advancing remaining hero: {st.get('activeHero')}")
            self.end_turn()
            st = self.get_state()

        # Step 3: Monster AI retaliates
        if st.get("phase") == "gm_phase":
            self.play_monster_phase()

        final_st = self.get_state()
        self.log_ai(f"✔ Scenario Finished: Round {final_st.get('round')}, Phase: {final_st.get('phase')}")
        self.log_ai(f"Combat Log Summary:\n" + "\n".join(final_st.get("combatLog", [])))

        return {
            "success": True,
            "final_state": final_st
        }

    def load_scenario(self, scenario_source: str | dict) -> dict:
        """Loads a robos:TabletopTestScenario JSON-LD file or dict."""
        if isinstance(scenario_source, str):
            with open(scenario_source, "r", encoding="utf-8") as f:
                return json.load(f)
        return scenario_source

    def execute_scenario_command(self, cmd: dict) -> dict:
        """Executes a single robos:TabletopAICommand from a scenario."""
        action = cmd.get("robos:action", cmd.get("action", ""))
        hero = cmd.get("robos:hero", cmd.get("hero", "active_hero"))
        rationale = cmd.get("robos:rationale", cmd.get("rationale", ""))
        self.log_ai(f"Executing scenario command '{action}' for {hero} (Rationale: {rationale})...")

        if action in ("roll_movement", "roll_movement_dice"):
            return self.roll_movement()
        elif action in ("move", "move_hero"):
            dest = cmd.get("robos:destination", cmd.get("destination", [0, 0]))
            return self.move(int(dest[0]), int(dest[1]))
        elif action == "open_door":
            from_pt = cmd.get("robos:from", cmd.get("from", [0, 0]))
            to_pt = cmd.get("robos:to", cmd.get("to", [0, 0]))
            return self.open_door(int(from_pt[0]), int(from_pt[1]), int(to_pt[0]), int(to_pt[1]))
        elif action in ("attack", "attack_adjacent_monster"):
            target = str(cmd.get("robos:target", cmd.get("target", "")))
            weapon = str(cmd.get("robos:weapon", cmd.get("weapon", "")))
            return self.attack(monster_id=target, weapon=weapon)
        elif action in ("search", "search_room"):
            return self.search()
        elif action == "end_turn":
            return self.end_turn()
        elif action in ("monster_turn", "ai_monster_turn"):
            return self.monster_turn()
        elif action == "ai_step":
            confirm = bool(cmd.get("confirm", True))
            return self.ai_step(confirm=confirm)
        else:
            return self.execute_action(action, **cmd)

    def execute_scenario(self, scenario_source: str | dict) -> dict:
        """Loads and executes a full robos:TabletopTestScenario."""
        scen = self.load_scenario(scenario_source)
        title = scen.get("dcterms:title", scen.get("title", "Unnamed Tabletop Scenario"))
        self.log_ai(f"=== Loading & Executing KGraph Scenario: '{title}' ===")

        commands = scen.get("robos:scriptedCommands", scen.get("scriptedCommands", []))
        results = []
        for cmd in commands:
            res = self.execute_scenario_command(cmd)
            results.append(res)
            time.sleep(self.human_delay)

        final_st = self.get_state()
        self.log_ai(f"✔ Scenario '{title}' completed. Round: {final_st.get('round')}, Revealed Rooms: {len(final_st.get('revealedRooms', []))}")
        return {
            "success": True,
            "scenario": scen,
            "results": results,
            "final_state": final_st
        }


if __name__ == "__main__":
    ai = TabletopRPCAI()
    if not ai.wait_for_ready(5.0):
        print("❌ Tabletop Game Control Server not running on port 18092.")
        exit(1)
    ai.run_first_exploration_scenario()
