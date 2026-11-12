@unreachable_order_feedback
Feature: Shortened routes mark their reachable endpoints
  Scenario: A click across a wall marks only the selected ground unit on the wrong side
    Given an RTS test scenario
      """
      {"name":"Split-side movement feedback","paused":true,"decor":false,
       "map":{"width":104,"height":72,"obstacles":[{"x":48,"y":0,"w":4,"h":72}]},
       "units":[{"id":"west","type":"rifleman","owner":1,"x":32,"y":25},
                {"id":"east","type":"rifleman","owner":1,"x":58,"y":24},
                {"id":"east_two","type":"rifleman","owner":1,"x":59,"y":31},
                {"id":"air","type":"kestrel_interceptor","owner":1,"x":38,"y":32}]}
      """
    When the commander frames (50, 28) at zoom height 62
    And the commander selects the mixed group "west,east,east_two,air"
    Then the commander has selected "west,east,east_two,air"
    When the commander right-clicks terrain at (71, 27)
    And the simulation advances 1 ticks
    Then only "west" has "partial" route feedback west of 48
    And "west" has orders "move"
    And "east" has orders "move"
    And "east_two" has a formation slot away from (71, 27)
    And "air" has orders "move"
    When the commander clicks unit "east"
    Then no selected routes are marked
    When the commander clicks unit "west"
    Then only "west" has "partial" route feedback west of 48
    When the simulation advances 420 ticks
    Then "west" has orders "none"
    And shortened route markers fade

  Scenario Outline: A raised gate marks the active leg until the route reopens
    Given an RTS test scenario
      """
      {"name":"Waiting route feedback","paused":true,"decor":false,
       "map":{"width":104,"height":72,"obstacles":[
          {"x":48,"y":0,"w":4,"h":22},{"x":48,"y":26,"w":4,"h":46}]},
       "units":[{"id":"gate","type":"silo_retracted","owner":1,"x":50,"y":24},
                {"id":"scout","type":"rifleman","owner":1,"x":25,"y":24}]}
      """
    When the commander frames (50, 26) at zoom height 65
    And the commander clicks unit "scout"
    And the commander right-clicks terrain at (<first_x>, 24)
    And the commander Shift-right-clicks terrain at (85, 36)
    And the simulation advances 75 ticks
    Then no selected routes are marked
    When player 1 issues "extend_silo" to unit "gate" toward (50.0, 24.0)
    And the simulation advances 420 ticks
    Then only "scout" has "waiting" route feedback west of 48
    And "scout" has orders "move,move"
    When player 1 issues "retract_silo" to unit "gate" toward (50.0, 24.0)
    And the simulation advances 1 ticks
    Then no selected routes are marked
    And "scout" has orders "move,move"
    When the simulation advances 650 ticks
    Then "scout" has orders "none"
    And unit "scout" is within 2.0 units of (85.0, 36.0)

    Examples:
      | first_x |
      | 76      |
      | 50      |

  Scenario: Lowering a Provision Silo lets infantry walk over it safely
    Given an RTS test scenario
      """
      {"name":"Silo crossing","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"gate","type":"silo","owner":1,"x":44,"y":27},
                {"id":"scout","type":"rifleman","owner":1,"x":32,"y":27}]}
      """
    When the commander clicks unit "gate"
    And the commander presses "Ctrl+1"
    And the commander presses "R"
    Then player 1 has 1 surviving "silo_retracted" units
    And player 1 has supply cap of at least 8
    When the commander clicks unit "scout"
    And the commander presses "Ctrl+2"
    And the commander right-clicks terrain at (44, 27)
    And the simulation advances 280 ticks
    Then unit "scout" is within 1.6 units of (44.0, 27.0)
    When the commander presses "1"
    And the commander presses "R"
    Then player 1 has 1 surviving "silo_retracted" units
    When the commander presses "2"
    And the commander right-clicks terrain at (56, 27)
    And the simulation advances 280 ticks
    Then unit "scout" is within 1.6 units of (56.0, 27.0)
    When the commander presses "1"
    And the commander presses "R"
    And the simulation advances 63 ticks
    Then player 1 has 1 surviving "silo_retracted" units
    When the simulation advances 1 ticks
    Then player 1 has 1 surviving "silo" units

  Scenario: A click inside a cliff marks its reachable near edge
    Given an RTS test scenario
      """
      {"name":"Projected edge feedback","paused":true,"decor":false,
       "map":{"width":128,"height":96,"obstacles":[{"x":48,"y":17,"w":50,"h":57}]},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":35}]}
      """
    When the commander clicks unit "scout"
    And the commander frames (41, 37) at zoom height 62
    And the commander right-clicks terrain at (73, 41)
    And the simulation advances 1 ticks
    Then only "scout" has "adjusted" route feedback west of 48
    When the commander right-clicks terrain at (32, 27)
    And the simulation advances 1 ticks
    Then no selected routes are marked
