Feature: Smoke test for Kol Village
  As a player
  I want to load Kol village with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Kol Village and verify initial spawn
    Given the game is launched on "Kol.tscn" in virtual display Xvfb
    Then hero is positioned at the initial tile for this map
    When the hero moves left 1 tiles
    Then the game transitions to "WorldMap"
    And hero is positioned at tile (106,12) facing "down"

