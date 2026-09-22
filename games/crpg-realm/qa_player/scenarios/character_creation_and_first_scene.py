#!/usr/bin/env python3
"""
Scenario: Character Creation and First Scene (Homestead)
Demonstrates a real player journey from Character Select through Homestead:
- Typing hero name
- Selecting Fighter class archetype
- Clicking Embark
- Arriving in Homestead
- Interacting with partner Elora and progressing dialogue
- Looting footlocker for equipment
- Exiting through front door into Village Square
NO direct backend mutations are used; all progress is triggered by user inputs.
"""

from __future__ import annotations
import time
from .base_scenario import BaseQAScenario
from ..qa_player import VideoGameQAPlayer

class CharacterCreationAndFirstSceneScenario(BaseQAScenario):
    name = "Character Creation and First Scene (Homestead)"
    description = (
        "Simulates a user selecting Fighter Lieutenant Vance, embarking into the Homestead, "
        "talking with partner Elora, looting the footlocker, and exiting into Oakhaven Village."
    )

    def execute(self, player: VideoGameQAPlayer) -> dict:
        player.log("=== STARTING QA SCENARIO: Character Creation & Homestead ===")

        # Step 1: Confirm on Character Select screen
        player.set_cucumber_step("Given the player is on the Character Selection screen", "Step 1/13: Verifying onboarding screen")
        time.sleep(1.2)
        screen = player.inspect_screen()
        assert screen.get("scene") == "CharacterSelect", f"Expected CharacterSelect, got {screen.get('scene')}"

        # Step 2: Type hero name into LineEdit
        player.set_cucumber_step('When the player enters hero name "Lieutenant Vance"', "Step 2/13: Typing name via input field")
        time.sleep(0.6)
        type_res = player.type_text("Lieutenant Vance", target="NameEdit")
        assert type_res.get("success"), f"Failed to type name: {type_res}"
        time.sleep(1.2)

        # Step 3: Click '⚔️ Fighter' class button
        player.set_cucumber_step('And the player selects the "Fighter" class archetype', "Step 3/13: Selecting martial vanguard (HP: 12, AC: 16)")
        btn_res = player.click_button("BtnFighter")
        assert btn_res.get("success"), f"Failed to click Fighter button: {btn_res}"
        time.sleep(1.4)

        # Step 4: Re-roll stats (First roll)
        player.set_cucumber_step('And the player rolls character ability scores', "Step 4/13: Rolling 4d6 drop lowest for STR, DEX, CON, INT, WIS, CHA")
        roll_res1 = player.click_button("BtnReroll")
        assert roll_res1.get("success"), f"Failed to click BtnReroll: {roll_res1}"
        time.sleep(1.8)

        # Step 5: Re-roll stats second time (Demonstrate re-rolling mechanism)
        player.set_cucumber_step('And the player re-rolls ability scores for optimal attributes', "Step 5/13: Demonstrating BG1/Diablo style stat re-rolling")
        roll_res2 = player.click_button("BtnReroll")
        assert roll_res2.get("success"), f"Failed to re-roll stats: {roll_res2}"
        time.sleep(1.8)

        # Step 6: Click 'EMBARK INTO OAKHAVEN ➔' button
        player.set_cucumber_step('And the player embarks into Oakhaven Homestead', "Step 6/13: Launching early access game loop")
        embark_res = player.click_button("EmbarkBtn")
        assert embark_res.get("success"), f"Failed to click Embark: {embark_res}"

        # Step 7: Wait for transition to Homestead
        player.set_cucumber_step('Then the Homestead scene is loaded and Elora initiates dialogue', "Step 7/13: Prologue awakening & confrontation")
        player.wait_for_scene("Homestead", timeout=6.0)

        # Wait for dialogue with Elora and provide reading delay for initial speech
        dialog = player.wait_for_dialogue(timeout=5.0)
        assert "Elora" in dialog.get("speaker", ""), f"Expected Elora speaker, got {dialog.get('speaker')}"
        player.log(f"Elora says: \"{dialog.get('text')}\"")
        time.sleep(3.2)  # Ample time for viewer to read opening confrontation

        # Step 8: Player selects amnesia response
        player.set_cucumber_step('When the player explains their amnesia: "I honestly don\'t remember anything"', "Step 8/13: Dialogue choice: node_wake -> node_amnesia")
        player.click_dialogue_choice(0)
        time.sleep(3.4)  # Ample time for viewer to read Elora's reaction to amnesia

        # Step 9: Player agrees to check the keep
        player.set_cucumber_step('And the player promises: "I will. Stay inside and bolt the door."', "Step 9/13: Dialogue choice: node_amnesia -> node_exit")
        player.click_dialogue_choice(0)
        time.sleep(2.8)  # Ample time for viewer to read Elora's parting blessing

        # Step 10: Player dismisses closing dialogue
        player.set_cucumber_step('And the player closes the dialogue to begin exploring', "Step 10/13: Dismissing dialogue prompt")
        player.click_dialogue_choice(0)
        player.wait_for_dialogue_closed(timeout=4.0)
        time.sleep(1.5)

        # Verify quest advanced to Stage 2
        game_state = player.inspect_game_state()
        assert game_state.get("quest_stage") == 2, f"Expected quest stage 2, got {game_state.get('quest_stage')}"
        assert game_state.get("flags", {}).get("partner_conversed") == True, "Expected partner_conversed true"

        # Step 11: Hero walks to the footlocker
        player.set_cucumber_step('When the player click-to-moves the hero to the footlocker chest', "Step 11/18: Walking across room to footlocker (250, 240)")
        move_res = player.move_player_to(250, 240)
        assert move_res.get("success"), f"Failed to move to footlocker: {move_res}"
        time.sleep(2.2)  # Watch hero walk smoothly across the room

        # Step 12: Player clicks on the Footlocker to loot it
        player.set_cucumber_step('And the player loots their personal footlocker', "Step 12/18: Interacting with footlocker chest")
        loot_res = player.click_world_object("Footlocker")
        assert loot_res.get("success"), f"Failed to click Footlocker: {loot_res}"
        time.sleep(2.5)  # Ample time to see chest opened and notice banner

        # Confirm items received
        game_state = player.inspect_game_state()
        inventory = game_state.get("inventory", [])
        player.log(f"Current Inventory: {inventory}")
        assert "service-sword" in inventory, f"Expected service-sword in inventory, got {inventory}"
        assert "potion-healing" in inventory, f"Expected potion-healing in inventory, got {inventory}"
        assert game_state.get("flags", {}).get("footlocker_looted") == True, "Expected footlocker_looted true"

        # Step 13: Player opens the Inventory Window
        player.set_cucumber_step('When the player opens the character inventory and equipment screen', "Step 13/18: Opening paperdoll & 16-slot backpack")
        inv_open = player.toggle_inventory()
        assert inv_open.get("success"), f"Failed to toggle inventory: {inv_open}"
        time.sleep(3.0)  # Ample time for viewer to inspect paperdoll, weapon/armor slots, and backpack items

        # Step 14: Player consumes healing potion from backpack
        player.set_cucumber_step('And the player uses a Potion of Healing to restore vitality', "Step 14/18: Drinking potion (rolls 2d4+2 HP restoration)")
        use_res = player.use_inventory_item("potion-healing")
        assert use_res.get("success"), f"Failed to use potion: {use_res}"
        time.sleep(2.2)  # Notice HP bar update and potion consumed

        # Step 15: Player closes the inventory
        player.set_cucumber_step('And the player closes the character inventory', "Step 15/18: Resuming overworld exploration")
        inv_close = player.toggle_inventory()
        assert inv_close.get("success"), f"Failed to close inventory: {inv_close}"
        time.sleep(1.2)

        # Step 16: Player walks toward the front door
        player.set_cucumber_step('When the player click-to-moves the hero to the front door', "Step 16/18: Walking to exit door (640, 540)")
        move_door = player.move_player_to(640, 540)
        assert move_door.get("success"), f"Failed to move to front door: {move_door}"
        time.sleep(2.2)  # Watch hero walk toward front door

        # Step 17: Player clicks on Front Door to exit into Village Square
        player.set_cucumber_step('And the player exits through the front door into Oakhaven Village', "Step 17/18: Interacting with FrontDoor portal")
        door_res = player.click_world_object("FrontDoor")
        assert door_res.get("success"), f"Failed to click FrontDoor: {door_res}"

        # Step 18: Wait for scene to become VillageSquare
        player.wait_for_scene("VillageSquare", timeout=6.0)
        player.set_cucumber_step('Then the player transitions smoothly into Oakhaven Village Square', "Scenario Complete: Movement & Inventory Playthrough 100% Passed!")
        time.sleep(3.5)  # Ample time to observe Village Square environment & NPCs

        player.log("🏆 === QA SCENARIO PASSED: Character Creation, Movement & Inventory Completed via Pure User Input! ===")
        return {
            "success": True,
            "scenario": self.name,
            "final_scene": "VillageSquare",
            "hero_name": game_state.get("hero", {}).get("name"),
            "hero_class": game_state.get("hero", {}).get("class"),
            "ability_scores": game_state.get("hero", {}).get("ability_scores"),
            "inventory": game_state.get("inventory"),
            "actions_executed": len(player.action_history)
        }
