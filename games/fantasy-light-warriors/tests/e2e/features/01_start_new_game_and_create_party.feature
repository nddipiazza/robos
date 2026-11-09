Feature: Start New Game and Create 4 Light Warriors
  As a player launching Fantasy: Light Warriors (WIP)
  I want to select NEW GAME on the Title Screen, configure my 4 Light Warriors, and spawn in Coneria
  So that the opening party creation and town entry flow works end-to-end

  Scenario: Start a New Game from TitleScreen, create 4 Light Warriors, and enter Coneria
    Given the game is launched on "TitleScreen" in virtual display Xvfb
    When the player selects NEW GAME on the title screen
    Then the game transitions to "PartyCreate"
    When the player creates the 4 Light Warriors and begins the quest
    Then the game transitions to "Coneria"
    And the hero is at tile (16, 21)
    And the party has 4 Light Warriors and 400 Gold
    And the game flag "party_created" is true
