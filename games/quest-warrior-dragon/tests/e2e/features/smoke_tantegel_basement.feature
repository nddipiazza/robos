Feature: Smoke test for Tantegel Castle Basement
  As a player
  I want to load Tantegel Castle Basement with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Tantegel Basement and verify initial spawn
    Given the game is launched on "TantegelBasement.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map
