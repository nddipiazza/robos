Feature: Smoke test for Tantegel Castle 1F
  As a player
  I want to load Tantegel Castle 1F with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Tantegel Castle 1F and verify initial spawn
    Given the game is launched on "Castle1F.tscn" in virtual display Xvfb
    Then hero is positioned at the initial tile for this map
