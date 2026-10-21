Feature: Smoke test for King Lorik's Throne Room
  As a player
  I want to load King Lorik's Throne Room with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Throne Room and verify initial spawn
    Given the game is launched on "ThroneRoom.tscn" in virtual display Xvfb
    Then hero is positioned at the initial tile for this map
