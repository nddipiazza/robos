Feature: Search Chest in Erdrick's Cave B2
  As a player
  I want to walk over to the treasure chest in Erdrick's Cave B2 and search it
  So that I can acquire Erdrick's Tablet

  Scenario: Search chest in Erdrick's Cave B2
    Given the game is launched on "ErdricksCaveB2.tscn" at tile (10, 4) in virtual display Xvfb
    And the hero has cast radiant
    When the hero uses the "search" command on the chest
    Then dialog is displayed with text containing "Thou dost find the Erdrick's Tablet"
    And the item "Erdrick's Tablet" is present in player inventory
