@disposable_scout
Feature: A paid Farsight Wisp scouts briefly without weapons or detection
  Scenario: A fragile flyer explores across a wall and releases supply when it expires
    Given an RTS test scenario
      """
      {"name":"Farsight Wisp scouting","paused":true,"decor":false,"fog_of_war":true,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":200,"aether":50}},
       "map":{"width":120,"height":68,"obstacles":[{"x":45,"y":0,"w":9,"h":68}]},
       "units":[{"id":"heart","type":"heartstone","owner":1,"x":16,"y":24},
                {"id":"source","type":"waystone","owner":1,"x":29,"y":26},
                {"id":"unpowered","type":"waystone","owner":1,"x":22,"y":55},
                {"id":"power","type":"resonator","owner":1,"x":28,"y":35},
                {"id":"guard","type":"sunblade","owner":2,"x":79,"y":25},
                {"id":"cloaker","type":"skirmisher","owner":2,"x":76,"y":29},
                {"id":"enemy","type":"colony_hub","owner":2,"x":109,"y":49}]}
      """
    When the commander frames (58, 34) at zoom height 82
    And the commander clicks the projected body of "unpowered" at (0.0, 1.15)
    And the commander presses "V"
    Then "unpowered" has 0 units in production
    And player 1 has 200 crystal, 50 aether and 0 supply used
    And the scouting cell at (79, 25) is unexplored
    When the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "V"
    Then player 1 has 155 crystal, 50 aether and 1 supply used
    When the simulation advances 767 ticks
    Then no "farsight_wisp" exists
    When the simulation advances 1 ticks
    Then the Farsight Wisp has 2304 lifetime ticks
    When player 2 issues "hold_fire" to unit "cloaker" toward (76.0, 29.0)
    And player 2 issues "phase_cloak" to unit "cloaker" toward (76.0, 29.0)
    And the commander selects the Farsight Wisp body
    And the commander presses "M"
    And the commander clicks a targeted point at (72, 25)
    And the simulation advances 384 ticks
    Then the Farsight Wisp has 1920 lifetime ticks
    And the Farsight Wisp is airborne near (72, 25)
    And the scouting cell at (79, 25) is visible
    And the scouting cell at (76, 29) is visible
    And the scouting cell at (101, 25) is unexplored
    And player 1 sees the guard and the cloaker stays hidden
    When the commander frames (73, 25) at zoom height 38
    And the commander right-clicks the projected body of "guard" at (0.0, 1.15)
    Then the Farsight Wisp cannot attack the guard
    And the battlefield is captured as "farsight-wisp"
    When the simulation advances 1919 ticks
    Then the Farsight Wisp has 1 lifetime ticks
    And the guard still has full health and shields
    When the simulation advances 1 ticks
    Then no "farsight_wisp" exists
    And player 1 has 155 crystal, 50 aether and 0 supply used
    And the scouting cell at (79, 25) is explored
    And the guard is outside live vision
