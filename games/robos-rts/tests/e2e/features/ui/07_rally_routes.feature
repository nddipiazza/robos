@rally_routes
Feature: Units can follow a squad and reinforcements can take a route
  Scenario: A right-click follows a friendly unit as it moves
    Given an RTS test scenario
      """
      {"name":"Follow orders","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"wing","type":"rifleman","owner":1,"x":29,"y":28},
                {"id":"leader","type":"howitzer","owner":1,"x":36,"y":28}]}
      """
    When the commander clicks unit "wing"
    And the commander right-clicks terrain at (36, 28)
    Then "wing" has orders "follow"
    When player 1 issues "move" to unit "leader" toward (55.0, 28.0)
    And the simulation advances 780 ticks
    Then "wing" is within 5 units of "leader"
    And "wing" has orders "follow"

  Scenario: A new Rifleman follows two ground waypoints and joins a moving unit
    Given an RTS test scenario
      """
      {"name":"Reinforcement route","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":19,"y":34},
                {"id":"hall","type":"muster_hall","owner":1,"x":27,"y":27},
                {"id":"leader","type":"howitzer","owner":1,"x":45,"y":32}]}
      """
    When the commander clicks unit "hall"
    And the commander right-clicks terrain at (30, 20)
    And the commander Shift-right-clicks terrain at (39, 20)
    And the commander Shift-right-clicks terrain at (45, 32)
    Then "hall" has a rally route ending at "leader"
    When the commander presses "A"
    And the simulation advances 300 ticks
    Then the new Rifleman has queued moves followed by an order to follow "leader"
    When player 1 issues "move" to unit "leader" toward (57.0, 29.0)
    And the simulation advances 1040 ticks
    Then the new Rifleman is within 5 units of "leader"

  Scenario: A crystal rally targets the clicked patch in a tight mineral line
    Given an RTS test scenario
      """
      {"name":"Crystal rally target","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"hub","type":"colony_hub","owner":1,"x":27,"y":28}],
       "resources":[{"id":"patch","type":"crystal_field","x":43,"y":29,"amount":1500},
                    {"id":"neighbor","type":"crystal_field","x":43,"y":25,"amount":1500}]}
      """
    When the commander clicks unit "hub"
    And the commander frames (36, 28) at zoom height 30
    And the commander right-clicks a crystal shard at (43.0, 28.1, 1.8)
    Then "hub" has a harvest rally centered on "patch"
