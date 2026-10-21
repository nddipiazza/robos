Feature: Smoke test for Charlock Castle & Lair
  As a player
  I want to load Charlock Castle levels and Throne Room with defaults
  So that I can verify the hero starts in the expected initial position and facing direction

  Scenario: Load Charlock Castle 1F and verify initial spawn
    Given the game is launched on "CharlockCastle1F.tscn" in virtual display Xvfb
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Castle B1 and verify initial spawn
    Given the game is launched on "CharlockCastleB1.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Castle B2 and verify initial spawn
    Given the game is launched on "CharlockCastleB2.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Castle B3 and verify initial spawn
    Given the game is launched on "CharlockCastleB3.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Castle B4 and verify initial spawn
    Given the game is launched on "CharlockCastleB4.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Castle B5 and verify initial spawn
    Given the game is launched on "CharlockCastleB5.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Castle B6 and verify initial spawn
    Given the game is launched on "CharlockCastleB6.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map

  Scenario: Load Charlock Throne Room and verify initial spawn
    Given the game is launched on "CharlockThroneRoom.tscn" in virtual display Xvfb
    And the hero has cast radiant
    Then hero is positioned at the initial tile for this map
