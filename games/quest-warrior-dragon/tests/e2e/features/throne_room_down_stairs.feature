Feature: Go down stairs using STAIRS command from King Lorik's Throne Room to main Castle
  As a player
  I want to go down the stairs to the main castle

  Scenario: Go down stairs using STAIRS command in throne room
    Given the game is launched on "ThroneRoom.tscn" with items "Magic Key" at tile (9, 9) in virtual display Xvfb
    When the player opens the command menu and selects the "STAIRS" command
    And the player advances the dialog page
    Then hero is positioned at tile (8, 8) facing "right"
