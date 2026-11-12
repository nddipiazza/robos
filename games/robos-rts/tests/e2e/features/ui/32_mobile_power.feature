@mobile_power
Feature: Concord carriers anchor temporary power for Waystones and landing sites
  Scenario: A paid carrier holds a forward field until it expires
    Given an RTS test scenario
      """
      {"name":"Concord mobile power","paused":true,"decor":false,"fog_of_war":true,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":1200,"aether":600}},
       "map":{"width":112,"height":68},
       "units":[{"id":"heart","type":"heartstone","owner":1,"x":15,"y":28},
                {"id":"home","type":"waystone","owner":1,"x":31,"y":24},
                {"id":"spare","type":"waystone","owner":1,"x":30,"y":44},
                {"id":"home_power","type":"resonator","owner":1,"x":31,"y":34},
                {"id":"forward","type":"waystone","owner":1,"x":68,"y":25},
                {"id":"enemy_gate","type":"waystone","owner":2,"x":78,"y":33},
                {"id":"enemy","type":"colony_hub","owner":2,"x":103,"y":56}]}
      """
    When the commander frames (53, 32) at zoom height 83
    And the commander clicks the projected body of "home" at (0.0, 1.15)
    And the commander presses "F"
    And the commander presses "L"
    Then player 1 has 900 crystal, 375 aether and 0 supply used
    And no "lumen_carrier" exists
    When the simulation advances 4928 ticks
    Then Fast Deployment research is complete
    And the Lumen Carrier has 0 active field ticks and 0 recharge ticks
    When the commander presses "Z"
    And the commander selects the Lumen Carrier
    And the commander right-clicks terrain at (67, 34)
    And the simulation advances 384 ticks
    Then the Lumen Carrier is near (67, 34)
    And "forward" is unpowered for production
    When the commander clicks the projected body of "home" at (0.0, 1.15)
    And the commander presses "D"
    And the commander clicks a targeted point at (73, 30)
    Then the command card is targeting "fast_deploy"
    And "home" has no planned deployment
    When the commander presses "Escape"
    And the commander selects the Lumen Carrier
    And the commander right-clicks terrain at (73, 40)
    And the commander presses "D"
    Then the Lumen Carrier has 1536 active field ticks and 0 recharge ticks
    And the Lumen Carrier refuses movement and keeps its anchor
    And the selected carrier has a temporary 12-unit power field
    And "forward" is powered for production
    And "enemy_gate" is unpowered for production
    And the anchored carrier is captured
    When the commander clicks the projected body of "forward" at (0.0, 1.15)
    And the commander presses "Z"
    And the commander clicks the projected body of "spare" at (0.0, 1.15)
    And the commander presses "Y"
    And the commander clicks a targeted point at (37, 44)
    And the commander presses "Z"
    And the commander presses "D"
    And the commander clicks a targeted point at (72, 37)
    Then "spare" has a deployment planned at (72, 37)
    When the commander clicks the projected body of "home" at (0.0, 1.15)
    And the commander presses "D"
    And the commander clicks a targeted point at (73, 30)
    Then "home" has a deployment planned at (73, 30)
    When the simulation advances 1344 ticks
    Then Sunblade 1 deployed near (73, 30)
    And "home" has 1280 deployment cooldown ticks
    And "forward" has 21.0 seconds of production progress
    And the Lumen Carrier remains at its anchor
    When the simulation advances 191 ticks
    Then the Lumen Carrier has 1 active field ticks and 0 recharge ticks
    When the commander records the production progress of "forward"
    And the simulation advances 1 ticks
    Then the Lumen Carrier has 0 active field ticks and 1152 recharge ticks
    And "forward" is unpowered for production
    When the simulation advances 192 ticks
    Then Sunblade 2 deployed near (37, 44)
    And "spare" has 0 deployment cooldown ticks
    And "forward" production has advanced 0.0 seconds since the record
    And player 1 has 600 crystal, 375 aether and 9 supply used
    When the commander selects the Lumen Carrier
    And the commander presses "D"
    Then the Lumen Carrier has 0 active field ticks and 960 recharge ticks
    When the commander right-clicks terrain at (85, 39)
    And the simulation advances 960 ticks
    Then the Lumen Carrier is near (85, 39)
    And the Lumen Carrier has 0 active field ticks and 0 recharge ticks
    When the commander presses "D"
    Then the Lumen Carrier has 1536 active field ticks and 0 recharge ticks
    When the commander presses "R"
    Then the Lumen Carrier has 0 active field ticks and 1152 recharge ticks
    And the infrastructure overlay is hidden
