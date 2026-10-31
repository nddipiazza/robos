@control_groups
Feature: Player control groups select and recall squads
  A commander can save owned squads, extend them, and recall them from the keyboard or HUD.

  Background:
    Given the game view is ready for control group input
    Given an RTS test scenario
      """
      {"name":"Control group proving grounds","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"alpha","type":"rifleman","owner":1,"x":24,"y":28},
                {"id":"bravo","type":"rifleman","owner":1,"x":30,"y":28},
                {"id":"charlie","type":"rifleman","owner":1,"x":36,"y":28},
                {"id":"hostile","type":"rifleman","owner":2,"x":52,"y":28}]}
      """

  Scenario: Assign, append and recall a squad using real selection and key input
    When the commander clicks unit "alpha"
    And the commander presses "Ctrl+1"
    And the commander clicks unit "bravo"
    And the commander presses "Ctrl+Shift+1"
    Then control group 1 contains "alpha,bravo"
    When the commander clicks unit "charlie"
    And the commander presses "1"
    Then the commander has selected "alpha,bravo"
    When the commander clicks unit "charlie"
    And the commander presses "Shift+1"
    Then the commander has selected "alpha,bravo,charlie"
    When the commander presses "Ctrl+9"
    And the commander clicks unit "hostile"
    And the commander presses "Ctrl+2"
    Then control group 2 contains "none"
    When the commander presses "9"
    Then the commander has selected "alpha,bravo,charlie"

  Scenario: Empty recall preserves selection and empty assignment clears a group
    When the commander clicks unit "alpha"
    And the commander presses "Ctrl+3"
    And the commander presses "4"
    Then the commander has selected "alpha"
    When the commander clears the selection
    And the commander presses "Ctrl+3"
    Then control group 3 contains "none"
    When the commander clicks unit "charlie"
    And the commander presses "3"
    Then the commander has selected "charlie"

  Scenario: Loading a new battlefield clears groups and selection
    When the commander clicks unit "alpha"
    And the commander presses "Ctrl+5"
    Given the RTS test scenario "starfall-canyon" from the knowledge graph
    Then control group 5 contains "none"
    And the commander has selected "none"
