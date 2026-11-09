@brood_burrow
Feature: A Skitterling can ambush from below ground
  Scenario: The command card burrows and surfaces an eligible unit
    Given an RTS test scenario
      """
      {"name":"Brood ambush","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":100,"height":68},
       "players":{"1":{"faction":"monsters"}},
       "units":[{"id":"ling","type":"skitterling","owner":1,"x":32,"y":28},
                {"type":"brood_nest","owner":1,"x":20,"y":39}]}
      """
    When the commander clicks unit "ling"
    And the commander presses "B"
    Then the Skitterling is burrowed and visible to its owner
    And the battlefield is captured as "brood-burrowed"
    When the commander right-clicks terrain at (47, 28)
    And the simulation advances 48 ticks
    Then unit "ling" is within 0.1 units of (32.0, 28.0)
    When the commander presses "B"
    Then the Skitterling is surfaced and visible to its owner
    When the commander right-clicks terrain at (47, 28)
    And the simulation advances 110 ticks
    Then unit "ling" is within 1.6 units of (47.0, 28.0)
    And the battlefield is captured as "brood-surfaced"
