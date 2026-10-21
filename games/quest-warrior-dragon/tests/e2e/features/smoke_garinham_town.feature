Feature: Smoke test for Garinham Town
  As a player
  I want to load Garinham town with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Garinham Town and verify initial spawn
    Given the game is launched on "Garinham.tscn" with items "" at tile (1, 15) facing "right"
    Then hero is positioned at the initial tile for this map
    When the hero moves left 1 tiles
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (4,4) facing "down"

