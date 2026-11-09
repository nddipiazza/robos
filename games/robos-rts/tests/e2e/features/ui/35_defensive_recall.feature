@defensive_recall
Feature: A Heartstone spends energy to recall allies that remain in its marker
  Scenario: The countdown recalls only eligible units that stay in the circle
    Given an RTS test scenario
      """
      {"name":"Heartstone defensive recall","paused":true,"decor":false,"fog_of_war":true,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":400,"aether":150}},
       "map":{"width":120,"height":76,"obstacles":[{"x":27,"y":33,"w":6,"h":5}]},
       "resources":[{"id":"crystal","type":"crystal_field","x":79,"y":27}],
       "units":[{"id":"home","type":"heartstone","owner":1,"x":22,"y":36},
                {"id":"backup","type":"heartstone","owner":1,"x":26,"y":56},
                {"id":"stayer","type":"sunblade","owner":1,"x":73,"y":34},
                {"id":"worker","type":"mote","owner":1,"x":76,"y":29},
                {"id":"flyer","type":"farsight_wisp","owner":1,"x":72,"y":27},
                {"id":"runner","type":"skirmisher","owner":1,"x":78,"y":33},
                {"id":"late","type":"sunblade","owner":1,"x":84,"y":36},
                {"id":"anchor","type":"lumen_carrier","owner":1,"x":70,"y":30},
                {"id":"opponent","type":"prospector","owner":2,"x":73,"y":38},
                {"id":"enemy","type":"colony_hub","owner":2,"x":107,"y":60}]}
      """
    When player 1 issues "hold_fire" to unit "stayer" toward (73.0, 34.0)
    And player 1 issues "hold_fire" to unit "runner" toward (78.0, 33.0)
    And player 1 issues "hold_fire" to unit "late" toward (84.0, 36.0)
    And player 1 issues "deploy_power_field" to unit "anchor" toward (70.0, 30.0)
    And the Mote loads crystal and holds it
    And the commander records the recall participants
    And the commander records "home" Heartstone energy
    And a direct recall from "home" at (109, 7) is attempted
    Then the direct recall is rejected
    When a direct recall from "home" at (37, 41) is attempted
    Then the direct recall is rejected
    And "home" has spent 0 recall energy
    When the commander frames (50, 36) at zoom height 92
    And the commander clicks the projected body of "home" at (0.0, 1.15)
    And the commander presses "R"
    Then the command card is targeting "defensive_recall"
    When the commander clicks a targeted point at (73, 32)
    Then the recall marker at (73, 32) has 192 ticks and an 8-unit radius
    And "home" has spent 50 recall energy
    And the recall marker is private to its owner
    When the commander records "backup" Heartstone energy
    And a direct recall from "backup" at (73, 32) is attempted
    Then the direct recall is rejected
    And "backup" has spent 0 recall energy
    When player 1 issues "move" to unit "runner" toward (87.0, 33.0)
    And player 1 issues "move" to unit "late" toward (76.0, 36.0)
    And the simulation advances 80 ticks
    Then unit "runner" is within 2.0 units of (87.0, 33.0)
    And unit "late" is within 2.0 units of (76.0, 36.0)
    And the recall marker at (73, 32) has 112 ticks and an 8-unit radius
    When the commander frames (73, 32) at zoom height 45
    Then the battlefield is captured as "defensive-recall"
    When player 1 issues "move" to unit "runner" toward (77.0, 33.0)
    And the simulation advances 111 ticks
    Then unit "runner" is within 2.0 units of (77.0, 33.0)
    And unit "stayer" is within 2.0 units of (73.0, 34.0)
    And the recall marker at (73, 32) has 1 ticks and an 8-unit radius
    When the simulation advances 1 ticks
    Then no defensive recall marker remains
    And "stayer" is within 8 units of "home"
    And "worker" is within 8 units of "home"
    And "flyer" is within 8 units of "home"
    And "worker" has orders "none"
    And the recalled ground units have clear, distinct exits
    And the recall preserved tags, cargo and supply
    And unit "runner" is within 2.0 units of (77.0, 33.0)
    And unit "late" is within 2.0 units of (76.0, 36.0)
    And unit "anchor" is within 0.1 units of (70.0, 30.0)
    And unit "opponent" is within 0.1 units of (73.0, 38.0)

  Scenario: Blocked Heartstone exits leave a recalled ground unit in place
    Given an RTS test scenario
      """
      {"name":"Recall exits blocked","paused":true,"decor":false,"victory":"all_structures",
       "map":{"width":104,"height":64,"obstacles":[{"x":18,"y":21,"w":14,"h":4},{"x":18,"y":35,"w":14,"h":4},
         {"x":16,"y":25,"w":4,"h":10},{"x":30,"y":25,"w":4,"h":10}]},
       "units":[{"id":"home","type":"heartstone","owner":1,"x":25,"y":30},
                {"id":"stayer","type":"sunblade","owner":1,"x":65,"y":30},
                {"id":"enemy","type":"colony_hub","owner":2,"x":94,"y":54}]}
      """
    When the commander frames (45, 30) at zoom height 70
    And the commander clicks the projected body of "home" at (0.0, 1.15)
    And the commander presses "R"
    And the commander clicks a targeted point at (65, 30)
    Then the recall marker at (65, 30) has 192 ticks and an 8-unit radius
    When the simulation advances 192 ticks
    Then no defensive recall marker remains
    And unit "stayer" is within 0.1 units of (65.0, 30.0)
    And "home" has 2.25 Heartstone energy

  Scenario: Losing the casting Heartstone cancels its recall
    Given an RTS test scenario
      """
      {"name":"Recall caster destroyed","paused":true,"decor":false,"victory":"all_structures",
       "map":{"width":112,"height":72},
       "units":[{"id":"home","type":"heartstone","owner":1,"x":25,"y":30,"hp":1,"shields":0},
                {"id":"backup","type":"heartstone","owner":1,"x":24,"y":56},
                {"id":"stayer","type":"sunblade","owner":1,"x":77,"y":30},
                {"id":"gun","type":"howitzer_emplaced","owner":2,"x":46,"y":29},
                {"id":"enemy","type":"colony_hub","owner":2,"x":100,"y":59}]}
      """
    When player 2 issues "hold_fire" to unit "gun" toward (46.0, 29.0)
    And the commander frames (51, 34) at zoom height 82
    And the commander clicks the projected body of "home" at (0.0, 1.15)
    And the commander presses "R"
    And the commander clicks a targeted point at (77, 30)
    Then the recall marker at (77, 30) has 192 ticks and an 8-unit radius
    When the opposing gun targets the casting Heartstone
    And the simulation advances 48 ticks
    Then no defensive recall marker remains
    When the simulation advances 144 ticks
    Then unit "stayer" is within 0.1 units of (77.0, 30.0)
