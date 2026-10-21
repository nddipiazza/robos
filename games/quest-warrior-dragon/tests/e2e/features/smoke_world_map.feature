Feature: Smoke test for World Map
  As a player
  I want to load the World Map with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load World Map and verify initial spawn
    Given the game is launched on "WorldMap.tscn" in virtual display Xvfb
    Then hero is positioned at the initial tile for this map
