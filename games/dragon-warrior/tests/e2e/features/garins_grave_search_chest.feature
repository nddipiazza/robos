Feature: Search Chest in Garin's Grave B3
  As a player
  I want to walk over to the treasure chest in Garin's Grave B3 and search it
  So that I can acquire the Silver Harp

  Scenario: Search chest in Garin's Grave B3
    Given the game is launched on "GarinhamB3.tscn" at tile (14, 7) in virtual display Xvfb
    And the hero has cast radiant
    When the hero uses the "search" command on the chest
    Then dialog is displayed with text containing "Thou dost find the Silver Harp"
    And the item "Silver Harp" is present in player inventory
