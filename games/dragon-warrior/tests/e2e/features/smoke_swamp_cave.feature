Feature: Smoke test for Swamp Cave
  As a player
  I want to walk into Swamp Cave from the World Map and exit using stairs
  So that I can verify entering and exiting transitions work correctly

  Scenario: Enter Swamp Cave from North entrance on World Map and exit using stairs
    Given the game is launched on "WorldMap.tscn" at tile (106, 45) facing "down" in virtual display Xvfb
    When the hero moves down 1 tiles
    Then the game transitions to "SwampCave"
    And hero is positioned at tile (1, 1) facing "down"
    When the hero has cast radiant
    And the player opens the command menu and selects the "STAIRS" command
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (106, 46) facing "down"

  Scenario: Enter Swamp Cave from South entrance on World Map and exit using stairs
    Given the game is launched on "WorldMap.tscn" at tile (106, 52) facing "up" in virtual display Xvfb
    When the hero moves up 1 tiles
    Then the game transitions to "SwampCave"
    And hero is positioned at tile (1, 30) facing "up"
    When the hero has cast radiant
    And the player opens the command menu and selects the "STAIRS" command
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (106, 51) facing "down"
