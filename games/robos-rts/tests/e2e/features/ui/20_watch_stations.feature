@watch_stations
Feature: Neutral watch stations extend vision while held
  Scenario: Holding, contesting, and leaving a watch station updates scouting
    Given an RTS test scenario
      """
      {"name":"Watch station scouting","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":104,"height":64,"watch_stations":[{"x":46,"y":24}]},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":24},
                {"id":"contender","type":"rifleman","owner":2,"x":46,"y":31},
                {"id":"distant","type":"howitzer_emplaced","owner":2,"x":75,"y":24}]}
      """
    When the commander frames (45, 24) at zoom height 40
    And both sides hold fire for the scouting check
    Then the watch station belongs to player 0
    And the distant contact is hidden to player 1
    When the commander clicks unit "scout"
    And the commander right-clicks terrain at (46, 22)
    And the simulation advances 210 ticks
    Then the watch station belongs to player 1
    And the distant contact is visible to player 1
    When the commander captures the held watch station
    And the contender moves to (46, 26)
    And the simulation advances 70 ticks
    Then the watch station belongs to player 0
    And the distant contact is hidden to player 1
    When the commander right-clicks terrain at (16, 24)
    And the simulation advances 315 ticks
    Then the watch station belongs to player 2
    And player 1 cannot see the watch station's owner
    When the contender moves to (46, 38)
    And the simulation advances 130 ticks
    Then the watch station belongs to player 0
