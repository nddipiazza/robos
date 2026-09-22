Feature: Infinity Engine Fog of War and Dynamic Vision Exploration
  As an adventurer exploring the expansive realm
  I want unexplored areas shrouded in blackness and previously seen areas dimmed in memory fog
  So that exploration feels tense, strategic, and faithful to classic Infinity Engine mechanics

  Scenario: Exploring through fog of war and testing vision reveal
    Given the cRPG game is running and healthy
    And an isolated test starting in scene "Homestead" with party "Lieutenant Vance" the "fighter"
    Then the current scene is "Homestead"
    And fog of war is active with unexplored shroud covering distant areas
    When the player moves across the map to explore
    Then the newly explored area is revealed in vision
    When the player exits to Oakhaven Village Square
    Then the current scene is "VillageSquare"
    And distant enemies remain concealed beneath unexplored shroud
    When the player toggles fog of war in settings
    Then the entire map is fully visible without shroud
    When the player re-enables fog of war
    Then fog of war is active with unexplored shroud covering distant areas
