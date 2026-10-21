Feature: Smoke test for Garin's Grave (Garinham B1-B4)
  As a player
  I want to load Garin's Grave floors with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Garin's Grave B1 and verify initial spawn
    Given the game is launched on "GarinhamB1.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Garin's Grave B2 and verify initial spawn
    Given the game is launched on "GarinhamB2.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Garin's Grave B3 and verify initial spawn
    Given the game is launched on "GarinhamB3.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Garin's Grave B4 and verify initial spawn
    Given the game is launched on "GarinhamB4.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map
