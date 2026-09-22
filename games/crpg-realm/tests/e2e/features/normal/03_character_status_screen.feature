Feature: D&D 5e Character Status Screen and Record Sheet
  As a player managing a party in an Infinity Engine cRPG
  I want a comprehensive character status screen accessible via hotkey C and portrait right-click
  So that I can inspect ability scores, saving throws, combat defenses, equipment offense, and status afflictions

  Scenario: Character status screen navigation, attributes, saves, and condition tracking
    Given the cRPG game is running and healthy
    And an isolated test starting in scene "Homestead" with party "Lieutenant Vance" the "fighter"
    Then the current scene is "Homestead"
    When the player speaks with partner Elora
    Then the active party contains 2 members
    And the physical party companion is active in the world
    And the activity log contains dialogue answer "I... I honestly don't remember anything after midnight."
    When the player opens the character status screen for party member 1
    Then the character status screen is visible
    When the player switches character status screen to party member 2
    Then the character status screen is visible
    When the player closes the character status screen
    Then the character status screen is closed
