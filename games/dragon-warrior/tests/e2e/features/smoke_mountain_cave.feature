Feature: Smoke test for Mountain Cave
  As a player
  I want to load Mountain Cave floors with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Mountain Cave B1 and verify initial spawn
    Given the game is launched on "MountainCaveB1.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Mountain Cave B2 and verify initial spawn
    Given the game is launched on "MountainCaveB2.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map
