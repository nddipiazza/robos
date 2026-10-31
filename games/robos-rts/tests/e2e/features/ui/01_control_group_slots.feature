@control_groups @rendered
Feature: Clickable control group slots
  Scenario: HUD modifiers assign and extend squads, then double click centers the camera
    Given the game view is ready for control group input
    Given an RTS test scenario
      """
      {"name":"Control group HUD proving grounds","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"alpha","type":"rifleman","owner":1,"x":24,"y":28},
                {"id":"bravo","type":"rifleman","owner":1,"x":30,"y":28},
                {"id":"charlie","type":"rifleman","owner":1,"x":36,"y":28}]}
      """
    When the commander clicks unit "alpha"
    And the commander clicks control slot 1 with "Ctrl"
    And the commander clicks unit "bravo"
    And the commander clicks control slot 1 with "Ctrl+Shift"
    Then control group 1 contains "alpha,bravo"
    When the commander clicks unit "charlie"
    And the commander clicks control slot 1 with "Shift"
    Then the commander has selected "alpha,bravo,charlie"
    When the commander clicks control slot 1 with "none"
    Then the commander has selected "alpha,bravo"
    When the commander double clicks control slot 1
    Then the control group camera is centered on unit "alpha"
    And the control group HUD proof is captured
