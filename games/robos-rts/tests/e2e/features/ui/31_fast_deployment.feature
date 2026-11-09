@fast_deployment
Feature: Concord Waystones deploy paid trainees through powered fields
  Scenario: Research opens a temporary deployment route with a cooldown and a safe fallback
    Given an RTS test scenario
      """
      {"name":"Concord Fast Deployment","paused":true,"decor":false,"fog_of_war":true,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":1000,"aether":500}},
       "map":{"width":110,"height":68},
       "units":[{"id":"heart","type":"heartstone","owner":1,"x":22,"y":25},
                {"id":"source","type":"waystone","owner":1,"x":42,"y":26},
                {"id":"spare","type":"waystone","owner":1,"x":43,"y":44},
                {"id":"unpowered","type":"waystone","owner":1,"x":22,"y":49},
                {"id":"home_power","type":"resonator","owner":1,"x":41,"y":34},
                {"id":"power","type":"resonator","owner":1,"x":70,"y":34,"hp":1,"shields":0},
                {"id":"gun","type":"howitzer_emplaced","owner":2,"x":94,"y":43},
                {"id":"enemy","type":"colony_hub","owner":2,"x":101,"y":53}]}
      """
    When player 2 issues "hold_fire" to unit "gun" toward (94.0, 43.0)
    And the commander frames (55, 34) at zoom height 78
    And a deployment command "research_fast_deployment" from "unpowered" at (70, 27) is attempted
    Then the deployment command is rejected
    When the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "Y"
    And the commander clicks a targeted point at (50, 26)
    And the commander presses "F"
    Then player 1 has 850 crystal, 350 aether and 0 supply used
    And Fast Deployment research is incomplete
    When a deployment command "research_fast_deployment" from "spare" at (70, 27) is attempted
    Then the deployment command is rejected
    When the simulation advances 2880 ticks
    Then Fast Deployment research is complete
    When a deployment command "fast_deploy" from "source" at (70, 27) is attempted
    Then the deployment command is rejected
    When the commander presses "Z"
    Then player 1 has 750 crystal, 350 aether and 2 supply used
    When the commander presses "D"
    Then the command card is targeting "fast_deploy"
    When the commander clicks a targeted point at (85, 15)
    Then the command card is targeting "fast_deploy"
    And "source" has no planned deployment
    When the commander clicks a targeted point at (70, 34)
    Then the command card is targeting "fast_deploy"
    And "source" has no planned deployment
    When the commander clicks a targeted point at (70, 27)
    Then "source" has a deployment planned at (70, 27)
    And the "source" Waystone has a rally at (50, 26)
    And no "sunblade" exists
    When the simulation advances 1727 ticks
    Then no "sunblade" exists
    When the simulation advances 1 ticks
    Then Sunblade 1 deployed near (70, 27)
    And "source" has 1280 deployment cooldown ticks
    And the Fast Deployment cooldown is captured
    When the commander presses "Z"
    And a deployment command "fast_deploy" from "source" at (74, 30) is attempted
    Then the deployment command is rejected
    And "source" has no planned deployment
    When the simulation advances 1280 ticks
    Then "source" has 0 deployment cooldown ticks
    When the commander presses "D"
    And the commander clicks a targeted point at (74, 30)
    Then "source" has a deployment planned at (74, 30)
    When the opposing gun targets the Resonator
    And the simulation advances 448 ticks
    Then Sunblade 2 deployed near (50, 26)
    And "source" has 0 deployment cooldown ticks
    And "source" has no planned deployment
    And the "source" Waystone has a rally at (50, 26)
    And player 1 has 650 crystal, 350 aether and 4 supply used
