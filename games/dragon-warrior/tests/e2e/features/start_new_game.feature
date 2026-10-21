Feature: Start New Game from Title Screen
  As a player
  I want to boot the title screen and enter inputs to start a new game
  So that I can enter King Lorik's throne room

  Scenario: Start a new game from title screen
    Given the game is launched on "TitleScreen.tscn" in virtual display Xvfb
    When the player performs inputs to start a new game
    Then the game transitions to ThroneRoom.tscn and King Lorik appears
