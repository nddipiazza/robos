@carapace_morph
Feature: A Bile Crawler can evolve into a paid armored ground unit
  Scenario: The command card reserves, refunds and completes an evolution
    Given an RTS test scenario
      """
      {"name":"Carapace evolution","paused":true,"decor":false,
       "players":{"1":{"faction":"monsters"}},"map":{"width":96,"height":64},
       "units":[{"id":"nest","type":"brood_nest","owner":1,"x":18,"y":26},
                {"id":"spire","type":"blight_spire","owner":1,"x":29,"y":21},
                {"id":"crawler","type":"bile_crawler","owner":1,"x":37,"y":29}]}
      """
    When the commander frames (35, 27) at zoom height 44
    And the commander clicks unit "crawler"
    And the commander presses "E"
    Then player 1 has 325 crystal, 100 aether and 3 supply used
    And "crawler" is "bile_crawler" with 384 evolution ticks left
    And the battlefield is captured as "brood-evolving"
    When the commander presses "X"
    Then player 1 has 400 crystal, 150 aether and 2 supply used
    When the commander presses "E"
    And the simulation advances 383 ticks
    Then "crawler" is "bile_crawler" with 1 evolution ticks left
    When the simulation advances 1 ticks
    Then "crawler" is "carapace_bulwark" with 0 evolution ticks left
    And the commander has selected "crawler"
    And player 1 has 325 crystal, 100 aether and 3 supply used
    And the battlefield is captured as "brood-bulwark"
