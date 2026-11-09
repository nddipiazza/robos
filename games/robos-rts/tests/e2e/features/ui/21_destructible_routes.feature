@destructible_routes
Feature: Destroying a neutral barrier opens a route
  Scenario: A Breacher clears a blocked crossing with an explicit attack
    Given an RTS test scenario
      """
      {"name":"Sealed crossing","paused":true,"decor":false,
       "map":{"width":96,"height":64,"obstacles":[
          {"x":40,"y":0,"w":4,"h":22},{"x":40,"y":30,"w":4,"h":34}],
          "route_blockers":[{"x":42,"y":26,"id":"barrier"}]},
       "units":[{"id":"scout","type":"breacher","owner":1,"x":28,"y":26}]}
      """
    When the commander frames (40, 26) at zoom height 40
    And the commander clicks unit "scout"
    And the commander presses "M"
    And the commander clicks a targeted point at (60, 26)
    And the simulation advances 350 ticks
    Then the barrier is intact and the scout is west of the crossing
    When the commander captures the crossing "blocked"
    And the commander right-clicks terrain at (42, 26)
    And the simulation advances 1600 ticks
    Then the barrier is destroyed
    When the commander presses "M"
    And the commander clicks a targeted point at (60, 26)
    And the simulation advances 420 ticks
    Then the scout reaches the far side of the crossing
    When the commander captures the crossing "open"
