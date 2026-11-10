@battlefield_controls
Feature: Battlefield powers, production and camera controls
  Scenario: Hub powers scan uphill from the minimap and reinforce a Silo
    Given an RTS test scenario
      """
      {"name":"Uphill sweep","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":96,"height":64,"high_ground":[{"x":48,"y":8,"w":28,"h":44}]},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":18,"y":24},
                {"id":"backup","type":"colony_hub","owner":1,"x":29,"y":16},
                {"id":"silo","type":"silo","owner":1,"x":31,"y":32},
                {"type":"pioneer","owner":1,"x":39,"y":24},
                {"id":"outpost","type":"silo","owner":2,"x":55,"y":31},
                {"id":"guard","type":"pioneer","owner":2,"x":53,"y":24}]}
      """
    Then player 1 has no sight of "outpost" or "guard"
    When the commander clicks unit "home"
    And the commander presses "E"
    And the commander targets minimap point (53, 24)
    Then player 1 can see "outpost" and "guard"
    And "home" has spent its starting Hub energy
    When the commander clicks unit "backup"
    And the commander presses "D"
    And the commander clicks the power target at (31, 32)
    Then "silo" is reinforced and player 1 has 46 supply capacity
    When the commander clicks unit "silo"
    And the commander presses "V"
    Then "silo" is salvaging

  Scenario: Shift-train balances five orders across selected producers
    Given an RTS test scenario
      """
      {"name":"Batch training","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":19,"y":22},
                {"id":"hall_a","type":"muster_hall","owner":1,"x":33,"y":27},
                {"id":"hall_b","type":"muster_hall","owner":1,"x":43,"y":27}]}
      """
    When the commander Ctrl-clicks unit "hall_a"
    And the commander presses "Shift+A"
    Then the two halls have a balanced batch of five units in production
    And player 1 has 150 crystal, 150 aether and 5 supply used

  Scenario: An idle Pioneer automatically repairs nearby machinery
    Given an RTS test scenario
      """
      {"name":"Automatic repair","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"tech","type":"pioneer","owner":1,"x":30,"y":27},
                {"id":"tank","type":"howitzer","owner":1,"x":35,"y":27,"hp":50}]}
      """
    Then "tech" has Auto-Repair on
    When the simulation advances 1024 ticks
    Then "tank" is fully repaired at a crystal cost

  Scenario: A camera tracks a moving scout until the commander moves the view
    Given an RTS test scenario
      """
      {"name":"Camera tracking","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"pioneer","owner":1,"x":29,"y":26}]}
      """
    When the commander clicks unit "scout"
    And the commander presses "Ctrl+F"
    And player 1 issues "move" to unit "scout" toward (55.0, 29.0)
    And the simulation advances 450 ticks
    Then the camera is tracking "scout"
    When the commander targets minimap point (30, 30)
    Then the camera has stopped tracking

  Scenario: Space cycles between recent fights and minimap pins reopen them
    Given an RTS test scenario
      """
      {"name":"Two battle alerts","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"rifleman","owner":1,"x":25,"y":30},
                {"type":"rifleman","owner":1,"x":65,"y":30},
                {"type":"rifleman","owner":2,"x":28,"y":30},
                {"type":"rifleman","owner":2,"x":68,"y":30}]}
      """
    When the simulation advances 24 ticks
    Then the commander can cycle and click the two battle alerts
