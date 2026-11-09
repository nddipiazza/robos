@asymmetric_setup
Feature: Choose skirmish factions and use separate Brood rallies
  Scenario: Choose Gnarl Brood versus Aurelian Concord on the title screen
    When the commander returns to the title from the battlefield
    And the commander clicks Skirmish on the title screen
    Then the title shows the "skirmish" page
    When the commander picks Gnarl Brood versus Aurelian Concord
    And the commander chooses Iron Narrows and starts from the title
    Then the battlefield starts with Brood Nest versus Heartstone
    When the commander selects their Brood Nest
    And the commander presses "Y"
    And the commander targets minimap point (60, 44)
    And the commander presses "G"
    And the commander targets minimap point (54, 43)
    Then the Nest has independent army and Forager rallies
    And the Brood production HUD is captured

  Scenario: Motes can summon Waystones from the command card
    Given an RTS test scenario
      """
      {"name":"Mote command hotkeys","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"mote","type":"mote","owner":1,"x":30,"y":26}]}
      """
    When the commander clicks unit "mote"
    And the commander presses "G"
    Then the command card is targeting "harvest"
    When the commander presses "Escape"
    And the commander presses "W"
    Then the command card is targeting "build_waystone"
