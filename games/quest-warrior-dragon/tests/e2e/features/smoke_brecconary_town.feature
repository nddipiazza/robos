Feature: Smoke test for Brecconary Town
  As a player
  I want to load Brecconary town with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Brecconary Town and verify initial spawn
    Given the game is launched on "Brecconary.tscn" with items "" at tile (1, 15) facing "left"
    Then hero is positioned at the initial tile for this map
    When the hero moves left 1 tiles
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (50,43) facing "down"
