@scouting
Feature: Scouts reveal enemy positions
  Scenario: Retreat keeps a building marker but hides the enemy army
    Given the game view is ready for control group input
    And an RTS test scenario
      """
      {"name":"Scouting route","fog_of_war":true,"paused":true,"decor":false,
       "map":{"width":112,"height":72},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":14,"y":30},
                {"id":"scout","type":"pioneer","owner":1,"x":22,"y":30},
                {"id":"outpost","type":"colony_hub","owner":2,"x":68,"y":30},
                {"id":"guard","type":"pioneer","owner":2,"x":66,"y":38}]}
      """
    Then player 1 has no sight of "outpost" or "guard"
    And player 1 has no record of "outpost"
    When player 1 issues "move" to unit "scout" toward (58.0, 30.0)
    And the simulation advances 640 ticks
    Then player 1 can see "outpost" and "guard"
    When player 1 issues "move" to unit "scout" toward (22.0, 30.0)
    And the simulation advances 640 ticks
    Then player 1 has no sight of "outpost" or "guard"
    And player 1 remembers the outpost at (68, 30)
