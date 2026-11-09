@roadmap_air
Feature: Paid aircraft and ground or air targeting
  Scenario: A trained interceptor crosses a wall that stops ground units
    Given an RTS test scenario
      """
      {"name":"Flight across the wall","paused":true,"decor":false,
       "map":{"width":104,"height":64,"obstacles":[{"x":44,"y":0,"w":8,"h":64}]},
       "units":[{"type":"colony_hub","owner":1,"x":15,"y":20},
                {"id":"shop","type":"airframe_hangar","owner":1,"x":30,"y":26},
                {"id":"infantry","type":"rifleman","owner":1,"x":26,"y":34}]}
      """
    When the commander frames (45, 28) at zoom height 52
    And the commander clicks unit "shop"
    And the commander presses "A"
    Then player 1 has 275 crystal, 50 aether and 4 supply used
    When the simulation advances 550 ticks
    And the commander selects the completed "kestrel_interceptor"
    And the commander presses "M"
    And the commander clicks a targeted point at (65, 26)
    And the commander clicks unit "infantry"
    And the commander presses "M"
    And the commander clicks a targeted point at (65, 34)
    And the simulation advances 440 ticks
    Then the interceptor is beyond the wall and the infantry is not

  Scenario: A paid Rampart delivers the same two Riflemen beyond a wall
    Given an RTS test scenario
      """
      {"name":"Rampart troop lift","paused":true,"decor":false,
       "map":{"width":104,"height":64,"obstacles":[{"x":47,"y":0,"w":8,"h":64}]},
       "units":[{"type":"colony_hub","owner":1,"x":13,"y":17},
                {"id":"hangar","type":"airframe_hangar","owner":1,"x":29,"y":29},
                {"id":"first","type":"rifleman","owner":1,"x":38,"y":26},
                {"id":"second","type":"rifleman","owner":1,"x":38,"y":32}]}
      """
    When the commander frames (47, 30) at zoom height 53
    And the commander clicks unit "first"
    And the commander clicks control slot 1 with "Ctrl"
    And the commander clicks unit "second"
    And the commander clicks control slot 1 with "Ctrl+Shift"
    And the commander clicks unit "hangar"
    And the commander presses "D"
    Then player 1 has 300 crystal, 50 aether and 4 supply used
    When the simulation advances 500 ticks
    And the commander selects the completed "rampart_transport"
    And the commander presses "L"
    Then the Rampart carries two Riflemen
    When the commander presses "U"
    And the commander clicks a targeted point at (67, 29)
    And the simulation advances 330 ticks
    Then "first" and "second" are deployed across the wall
    When the commander clicks control slot 1 with "none"
    Then the commander has selected "first,second"

  Scenario: A ground-only mortar cannot hit a flyer while a Rifleman can target it
    Given an RTS test scenario
      """
      {"name":"Air target domains","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"mortar","type":"howitzer_emplaced","owner":1,"x":25,"y":26},
                {"id":"infantry","type":"rifleman","owner":1,"x":29,"y":37},
                {"id":"flyer","type":"kestrel_interceptor","owner":2,"x":40,"y":26},
                {"id":"guard","type":"breacher","owner":2,"x":40,"y":28}]}
      """
    When the commander frames (36, 26) at zoom height 44
    And the commander clicks unit "infantry"
    And the commander presses "K"
    And the commander clicks unit "mortar"
    And the commander presses "A"
    And the commander clicks the airborne unit "flyer"
    Then "mortar" has orders "none"
    When the simulation advances 30 ticks
    Then the mortar damages "guard" without hitting "flyer"
    When the commander clicks unit "infantry"
    And the commander right-clicks the airborne unit "flyer"
    And the simulation advances 120 ticks
    Then "flyer" has taken damage
    And the battlefield is captured as "air-intercept"
