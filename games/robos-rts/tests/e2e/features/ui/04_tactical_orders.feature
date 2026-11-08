@tactical_orders
Feature: Command a squad across the map
  Scenario: Targeted minimap orders preserve the camera and patrol repeats both legs
    Given an RTS test scenario
      """
      {"name":"Order drill","paused":true,"decor":false,"map":{"width":112,"height":72},
       "units":[{"id":"guard","type":"rifleman","owner":1,"x":24,"y":28}]}
      """
    When the commander clicks unit "guard"
    And the commander presses "M"
    And the commander targets minimap point (38, 28)
    And the commander presses "A"
    And the commander targets minimap point (44, 28) with Shift
    Then "guard" has orders "move,attack_move"
    And the camera frames (35, 28) at zoom height 40
    When the commander presses "P"
    And the commander targets minimap point (46, 28)
    Then "guard" has orders "patrol"
    And "guard" reaches (46, 28) and returns to (24, 28) while patrolling
    When the commander presses "S"
    Then "guard" has orders "none"
