Feature: Open Door with Key in King Lorik's Throne Room
  As a player
  I want to place a Magic Key in the hero's inventory in the throne room at position (5,5)
  And move down 2 tiles to stand directly facing the locked door
  And open the main menu, select the "DOOR" command, and confirm with A button
  So that the door unlocks and the tile under becomes a brick floor tile

  Scenario: Open door using DOOR command in throne room
    Given the game is launched on "ThroneRoom.tscn" with items "Magic Key" at tile (5, 5) in virtual display Xvfb
    When the hero moves down 2 tiles
    Then hero is positioned at tile (5, 7) facing "down"
    When the player opens the command menu and selects the "DOOR" command
    Then dialog is displayed with text containing "The door clicks open"
    And the door at position (5, 8) is unlocked and tile is brick floor
