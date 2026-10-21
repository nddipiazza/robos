Feature: Search Chest in Mountain Cave B2
  As a player
  I want to walk over to the treasure chest in Mountain Cave B2 and search it
  So that I can acquire the Fighter's Ring

  Scenario: Search chest in Mountain Cave B2
    Given the game is launched on "MountainCaveB2.tscn" at tile (3, 3) in virtual display Xvfb
    And the hero has cast radiant
    When the hero uses the "search" command on the chest
    Then dialog is displayed with text containing "Thou dost find the Fighter's Ring"
    And the item "Fighter's Ring" is present in player inventory
