@camera_navigation
Feature: Camera navigation leaves the selected squad in command
  Scenario: Bookmarks restore zoom and base cycling wraps through finished friendly bases
    Given an RTS test scenario
      """
      {"name":"Camera navigation","paused":true,"decor":false,"map":{"width":128,"height":96},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":24,"y":32},
                {"id":"expansion","type":"colony_hub","owner":1,"x":62,"y":32},
                {"type":"colony_hub","owner":1,"x":90,"y":32,"build_progress":0.2},
                {"type":"colony_hub","owner":2,"x":110,"y":55},
                {"id":"guard","type":"rifleman","owner":1,"x":35,"y":26}]}
      """
    When the commander clicks unit "guard"
    And the commander frames (42, 37) at zoom height 53
    And the commander presses "Ctrl+F3"
    And the commander frames (78, 45) at zoom height 38
    And the commander presses "F3"
    Then the camera frames (42, 37) at zoom height 53
    When the commander presses "Backspace"
    Then the camera frames (24, 32) at zoom height 53
    When the commander presses "Backspace"
    Then the camera frames (62, 32) at zoom height 53
    When the commander presses "Backspace"
    Then the camera frames (24, 32) at zoom height 53
    And the commander has selected "guard"
