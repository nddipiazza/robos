@blocked_destinations
Feature: Battlefield movement respects impassable destinations
  Scenario: Ground clicks resolve at the near edge of cliffs and resource deposits
    Given an RTS test scenario
      """
      {"name":"Blocked command destinations","paused":true,"decor":false,
       "map":{"width":128,"height":96,"obstacles":[{"x":48,"y":17,"w":50,"h":57}]},
       "resources":[{"id":"vent","type":"aether_vent","x":37,"y":35,"amount":2250}],
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":35}]}
      """
    When the commander clicks unit "scout"
    And the commander frames (41, 37) at zoom height 62
    And the commander right-clicks terrain at (73, 41)
    And the simulation advances 480 ticks
    Then "scout" has orders "none"
    And unit "scout" is within 3.0 units of (46.0, 38.0)
    When the commander right-clicks terrain at (37, 35)
    And the simulation advances 300 ticks
    Then "scout" has orders "none"
    And unit "scout" is within 2.5 units of (41.5, 36.5)
