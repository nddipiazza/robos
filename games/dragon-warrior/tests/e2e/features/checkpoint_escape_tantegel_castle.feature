Feature: Escape Tantegel Castle to World Map via In-Engine AI Checkpoints
  As a player or autonomous demo AI
  I want the in-engine AI to play the game using only real user inputs
  From a fresh game or saved checkpoint state until a target checkpoint is achieved
  So that we can chain checkpoints together to prove full-game completion

  Scenario: create game can get to world map
    Given create fresh game
    When complete dialog with king
    Then verify that game state is {"scene": "ThroneRoom", "tile": "4,5", "dialog_showing": "false"}
    When move to pos (6, 5)
    And obtain chest
    Then verify that game state is {"scene": "ThroneRoom", "tile": "6,5", "has_item": "Magic Key"}
    When move to pos (5, 7) facing "down"
    And open door
    Then verify that game state is {"scene": "ThroneRoom", "tile": "5,7", "door_unlocked": "throne_room"}
    When move to pos (9, 9)
    And stairs
    Then verify that game state is {"scene": "Castle1F", "tile": "8,8"}
    When move to pos (11, 30)
    And move to pos (11, 31)
    Then verify that game state is {"scene": "WorldMap", "tile": "45,45"}
    And save game state to checkpoint "escaped_tantegel_castle"

  Scenario: resume from saved checkpoint on world map and fight battle in demo mode
    Given the game state is loaded from checkpoint "escaped_tantegel_castle"
    Then verify that game state is {"scene": "WorldMap", "tile": "45,45"}
    When the player triggers a random encounter with monster "slime"
    Then a battle is active against monster "slime"
    When the in-engine AI plays until checkpoint "battle_completed"
    Then verify that game state is {"scene": "WorldMap", "tile": "45,45"}
