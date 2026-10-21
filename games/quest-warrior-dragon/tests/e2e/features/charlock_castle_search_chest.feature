Feature: Search Chest in Charlock Castle B2
  As a player
  I want to walk over to the treasure chest in Charlock Castle B2 and search it
  So that I can acquire Erdrick's Sword

  Scenario: Search chest in Charlock Castle B2
    Given the game is launched on "CharlockCastleB2.tscn" at tile (6, 6) in virtual display Xvfb
    And the hero has cast radiant
    When the hero uses the "search" command on the chest
    Then dialog is displayed with text containing "Thou dost find the Erdrick's Sword"
    And the item "Erdrick's Sword" is present in player inventory
