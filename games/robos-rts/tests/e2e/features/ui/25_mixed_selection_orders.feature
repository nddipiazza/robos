@mixed_selection_orders
Feature: One context click dispatches compatible roles
  Scenario: A mineral click gathers, moves an escort, and leaves emplaced artillery alone
    Given an RTS test scenario
      """
      {"name":"Mixed mineral order","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":17,"y":24},
                {"id":"miner","type":"pioneer","owner":1,"x":26,"y":21},
                {"id":"escort","type":"rifleman","owner":1,"x":32,"y":25},
                {"id":"artillery","type":"howitzer_emplaced","owner":1,"x":31,"y":32}],
       "resources":[{"id":"ore","type":"crystal_field","x":44,"y":24,"amount":500}]}
      """
    When player 1 issues "move" to unit "miner" toward (26.0, 23.0)
    And player 1 issues "move" to unit "escort" toward (31.0, 25.0)
    And player 1 issues "hold_position" to unit "artillery" toward (31.0, 32.0)
    And the commander frames (36, 27) at zoom height 44
    And the commander selects the mixed group "miner,escort,artillery"
    Then the commander has selected "miner,escort,artillery"
    When the commander Shift-right-clicks terrain at (44, 24)
    Then "miner" has orders "move,harvest"
    And "escort" has orders "move,move"
    And "artillery" has orders "hold_position"
    When the commander right-clicks terrain at (44, 24)
    Then "miner" has orders "harvest"
    And "miner" gathers from deposit "ore"
    And "escort" has orders "move"
    And "escort" is ordered to move toward (44, 24)
    And "artillery" has orders "hold_position"

  Scenario: The nearest worker resumes a foundation while an escort moves up
    Given an RTS test scenario
      """
      {"name":"Mixed construction handoff","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":17,"y":24},
                {"id":"backup","type":"pioneer","owner":1,"x":36,"y":22},
                {"id":"distant","type":"pioneer","owner":1,"x":24,"y":28},
                {"id":"escort","type":"rifleman","owner":1,"x":29,"y":24},
                {"id":"site","type":"silo","owner":1,"x":44,"y":24,"build_progress":0.4}]}
      """
    When player 1 issues "hold_position" to unit "distant" toward (24.0, 28.0)
    And the commander frames (34, 26) at zoom height 44
    And the commander selects the mixed group "distant,backup,escort"
    Then the commander has selected "distant,backup,escort"
    When the commander right-clicks terrain at (44, 24)
    Then "backup" has orders "build"
    And "distant" has orders "hold_position"
    And "escort" has orders "move"
    And "escort" is ordered to move toward (44, 24)
    When the simulation advances 440 ticks
    Then a finished "silo" stands at (44, 24)

  Scenario: A Pioneer repairs a damaged tank while infantry follow it
    Given an RTS test scenario
      """
      {"name":"Mixed repair escort","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":17,"y":24},
                {"id":"mechanic","type":"pioneer","owner":1,"x":32,"y":21},
                {"id":"escort","type":"rifleman","owner":1,"x":31,"y":29},
                {"id":"tank","type":"howitzer","owner":1,"x":43,"y":24,"hp":75}]}
      """
    When the commander frames (36, 25) at zoom height 44
    And the commander selects the mixed group "mechanic,escort,tank"
    Then the commander has selected "mechanic,escort,tank"
    When the commander right-clicks the projected body of "tank" at (0.0, 1.15)
    Then "mechanic" has a "repair" order for "tank"
    And "escort" has a "follow" order for "tank"
    And "tank" has orders "none"

  Scenario: An enemy body near a deposit takes priority over gathering
    Given an RTS test scenario
      """
      {"name":"Attack near minerals","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"miner","type":"pioneer","owner":1,"x":26,"y":21},
                {"id":"escort","type":"rifleman","owner":1,"x":32,"y":25},
                {"id":"enemy","type":"rifleman","owner":2,"x":44,"y":27.3}],
       "resources":[{"id":"ore","type":"crystal_field","x":44,"y":24,"amount":500}]}
      """
    When the commander frames (36, 27) at zoom height 44
    And the commander selects the mixed group "miner,escort"
    Then the commander has selected "miner,escort"
    When the commander right-clicks the projected body of "enemy" at (0.0, 1.15)
    Then "miner" has an "attack_target" order for "enemy"
    And "escort" has an "attack_target" order for "enemy"
    When the commander right-clicks terrain at (44, 24)
    Then "miner" gathers from deposit "ore"
    And "escort" is ordered to move toward (44, 24)
