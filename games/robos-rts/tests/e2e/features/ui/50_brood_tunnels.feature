@brood_tunnels
Feature: Linked Brood entrances carry a timed reinforcement squad
  Scenario: Link two entrances and send a control group beneath a full-width wall
    Given an RTS test scenario
      """
      {"name":"Brood reinforcement tunnels","paused":true,"decor":false,
       "players":{"1":{"faction":"monsters"}},
       "map":{"width":104,"height":64,"obstacles":[{"x":47,"y":0,"w":8,"h":64}]},
       "units":[{"id":"west","type":"tunnel_mouth","owner":1,"x":32,"y":30},
                {"id":"east","type":"tunnel_mouth","owner":1,"x":67,"y":30},
                {"id":"troop","type":"skitterling","owner":1,"x":37,"y":28}]}
      """
    When the commander frames (49, 28) at zoom height 60
    And the commander clicks unit "troop"
    And the commander clicks control slot 2 with "Ctrl"
    And the commander clicks unit "west"
    And the commander presses "L"
    And the commander clicks a targeted point at (67, 30)
    Then entrances "west" and "east" are linked
    When the commander presses "S"
    Then "west" is sending 1 unit with 128 ticks left
    And the battlefield is captured as "brood-tunnel-link"
    When the simulation advances 127 ticks
    Then "west" is sending 1 unit with 1 ticks left
    When the simulation advances 1 ticks
    Then "troop" has crossed to the eastern tunnel
    When the commander clicks control slot 2 with "none"
    Then the commander has selected "troop"
