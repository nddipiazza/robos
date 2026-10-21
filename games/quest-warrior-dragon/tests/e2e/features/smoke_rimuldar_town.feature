Feature: Smoke test for Rimuldar Town
  As a player
  I want to load Rimuldar town with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Rimuldar Town and verify initial spawn
    Given the game is launched on "Rimuldar.tscn" with items "" at tile (1, 16) facing "right"
    Then hero is positioned at the initial tile for this map
    When the hero moves left 1 tiles
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (104,74) facing "down"

