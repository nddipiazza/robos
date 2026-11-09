Feature: Checkpoint-Chained Autonomous AI Playthrough to Kill Garland 1
  As a player or autonomous demo AI
  I want the in-engine PlayGameBrain to play Fantasy: Light Warriors (WIP) from milestone to milestone using only real user inputs
  Saving and loading checkpoints between milestones until Garland is defeated in the Temple of Fiends

  Scenario: Milestone 01 to 06 - Form Party, Talk to Guard, and Equip Gear & Magic in Coneria
    Given create fresh game
    When the in-engine AI plays until milestone 6 "buy-fire-coneria"
    Then the game flag "party_created" is true
    And the game flag "talked_coneria_guard" is true
    And the game flag "bought_weapon_coneria" is true
    And the game flag "bought_armor_coneria" is true
    And the game flag "bought_white_magic_coneria" is true
    And the game flag "bought_black_magic_coneria" is true
    And save game state to checkpoint "06-buy-fire-coneria"

  Scenario: Milestone 07 to 08 - Load Coneria Checkpoint, Enter Castle, and Hear the King's Quest
    Given the game state is loaded from checkpoint "06-buy-fire-coneria"
    When the in-engine AI plays until milestone 8 "talk-king-coneria"
    Then the game flag "king_intro_done" is true
    And save game state to checkpoint "08-talk-king-coneria"

  Scenario: Milestone 09 to 12 - Load Castle Checkpoint, March to Temple of Fiends, Loot Chests, and Defeat Garland 1
    Given the game state is loaded from checkpoint "08-talk-king-coneria"
    When the in-engine AI plays until milestone 12 "defeat-garland-1"
    Then the game flag "first_encounter_won" is true
    And the item "HEAL Potion" is present in player inventory
    And the item "CABIN" is present in player inventory
    And the item "Cap" is present in player inventory
    And Garland is defeated and Princess Sara is rescued
    And save game state to checkpoint "12-defeat-garland-1"
