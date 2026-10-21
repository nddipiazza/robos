Feature: Smoke test for Erdrick's Cave
  As a player
  I want to load Erdrick's Cave floors with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Erdrick's Cave B1 and verify initial spawn
    Given the game is launched on "ErdricksCaveB1.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Erdrick's Cave B2 and verify initial spawn
    Given the game is launched on "ErdricksCaveB2.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map
