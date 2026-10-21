Feature: Smoke test for Cantlin Town
  As a player
  I want to load Cantlin town with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Cantlin Town and verify initial spawn
    Given the game is launched on "Cantlin.tscn" in virtual display Xvfb
    Then hero is positioned at the initial tile for this map
    When the hero moves left 1 tiles
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (75,104) facing "down"

