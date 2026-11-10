@production_controls
Feature: Control production and send workers directly to resources
  Scenario Outline: New workers inherit a resource rally
    Given an RTS test scenario
      """
      {"name":"Rally drill","paused":true,"decor":false,"map":{"width":112,"height":72},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":24,"y":28},
                {"id":"tap","type":"aether_tap","owner":1,"x":40,"y":38}],
       "resources":[{"id":"crystal","type":"crystal_field","x":40,"y":26,"amount":1000},
                    {"id":"vent","type":"aether_vent","x":40,"y":38,"amount":1000}]}
      """
    When the commander clicks unit "home"
    And the commander right-clicks terrain at (40, <y>)
    And the commander presses "S"
    And the simulation advances 200 ticks
    Then a newly trained Pioneer gathers from "<target>"

    Examples:
      | y  | target  |
      | 26 | crystal |
      | 38 | tap     |

  Scenario: Cancel a middle queue slot and refund its actual costs
    Given an RTS test scenario
      """
      {"name":"Production drill","paused":true,"decor":false,"map":{"width":112,"height":72},
       "players":{"1":{"crystal":400,"aether":150}},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":20,"y":37},
                {"id":"hall","type":"muster_hall","owner":1,"x":42,"y":28}]}
      """
    When the commander clicks unit "hall"
    And the commander presses "A"
    And the commander presses "D"
    And the commander presses "A"
    Then "hall" has 3 units in production
    And player 1 has 200 crystal, 125 aether and 4 supply used
    And the production controls are captured
    When the commander cancels production slot 2
    And the commander cancels production slot 5
    Then "hall" has 2 units in production
    And player 1 has 300 crystal, 150 aether and 2 supply used
    When the simulation advances 640 ticks
    Then player 1 has 2 surviving "rifleman" units
    And player 1 has 0 surviving "breacher" units

  Scenario: Holding the Pioneer hotkey repeats after a delay and refills a free slot
    Given an RTS test scenario
      """
      {"name":"Held training hotkey","paused":true,"decor":false,"map":{"width":96,"height":64},
       "players":{"1":{"crystal":500,"aether":0}},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":30,"y":28}]}
      """
    When the commander clicks unit "home"
    And the commander holds "S" to train
    Then "home" keeps 1 queued unit during the initial repeat delay
    And "home" eventually has at least 2 units in production
    When the commander releases "S"
    Then production at "home" receives no further orders
    When the commander holds "S" to train
    Then "home" eventually has at least 5 units in production
    And player 1 has 250 crystal, 0 aether and 5 supply used
    When the simulation advances 200 ticks
    Then player 1 has 1 surviving "pioneer" units
    And "home" eventually has at least 5 units in production
    When the commander releases "S"
    Then player 1 has 200 crystal, 0 aether and 6 supply used

  Scenario: Changing selection stops an active training repeat
    Given an RTS test scenario
      """
      {"name":"Held training selection change","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":27,"y":28},
                {"id":"other","type":"colony_hub","owner":1,"x":43,"y":28}]}
      """
    When the commander clicks unit "home"
    And the commander holds "S" to train
    Then "home" eventually has at least 2 units in production
    When the commander clicks unit "other"
    Then production at "home" receives no further orders
    And "other" has 0 units in production
    When the commander releases "S"
