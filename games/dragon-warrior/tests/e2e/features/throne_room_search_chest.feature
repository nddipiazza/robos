Feature: Search Chest in King Lorik's Throne Room
  As a player
  I want to walk over to a treasure chest in the throne room and use the search command
  So that I can locate the contents inside the chest

  Scenario: Search chest in throne room
    Given the game is launched on "ThroneRoom.tscn" with king intro done at tile (4, 5) in virtual display Xvfb
    Then no dialog is displayed
    When the hero moves right 1 tiles
    Then hero is positioned at tile (5, 5) facing "right"
    When the hero uses the "search" command on the chest
    Then dialog is displayed with text containing "Thou dost find a Treasure"
    And the item "Torch" is present in player inventory
