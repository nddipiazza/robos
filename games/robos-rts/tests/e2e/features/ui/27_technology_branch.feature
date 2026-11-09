@technology_branch
Feature: The faction card shows live technology and production
  Scenario: Meridian Guard tracks foundations, production, and rising research costs
    Given an RTS test scenario
      """
      {"name":"Meridian technology","paused":true,"decor":false,
       "map":{"width":104,"height":64},
       "units":[{"id":"hub","type":"colony_hub","owner":1,"x":20,"y":24},
                {"id":"builder","type":"pioneer","owner":1,"x":39,"y":22},
                {"id":"silo","type":"silo","owner":1,"x":46,"y":25,"build_progress":0.95},
                {"id":"hall","type":"muster_hall","owner":1,"x":55,"y":25,"build_progress":0.95},
                {"id":"shop","type":"workshop","owner":1,"x":64,"y":25,"build_progress":0.95}]}
      """
    When the commander frames (44, 25) at zoom height 48
    And the commander clicks unit "builder"
    And the commander opens the faction technology panel
    Then the faction technology panel shows "humans"
    And the commander has selected "builder"
    And technology "silo" is "Building" and costs 100 crystal, 0 aether, and 0 supply
    And technology "muster_hall" shows prerequisite "silo" as "Building"
    And technology "sentry_turret" is "Locked" and costs 125 crystal, 0 aether, and 0 supply
    And technology "rifleman" is "Locked" and costs 50 crystal, 0 aether, and 1 supply
    And technology "research_weapons" is "Locked" and costs 100 crystal, 100 aether, and 0 supply
    When the commander clicks a technology row
    Then the commander has selected "builder"
    And "builder" has orders "none"
    When the commander presses "M"
    Then the command card is targeting "move"
    When the commander clicks a targeted point at (43, 28)
    Then "builder" has orders "move"
    When the commander right-clicks terrain at (46, 25)
    And the simulation advances 170 ticks
    Then technology "muster_hall" shows prerequisite "silo" as "Complete"
    When the commander right-clicks terrain at (55, 25)
    And the simulation advances 220 ticks
    Then technology "rifleman" is "Unlocked" and costs 50 crystal, 0 aether, and 1 supply
    And technology "sentry_turret" is "Available" and costs 125 crystal, 0 aether, and 0 supply
    When the commander right-clicks terrain at (64, 25)
    And the simulation advances 220 ticks
    Then technology "kestrel_interceptor" is "Unlocked" and costs 125 crystal, 100 aether, and 3 supply
    When player 1 issues "research_weapons" to unit "shop" toward (64.0, 25.0)
    Then technology "research_weapons" is "Queued" and costs 100 crystal, 100 aether, and 0 supply
    When the simulation advances 680 ticks
    Then technology "research_weapons" is "Unlocked" and costs 175 crystal, 175 aether, and 0 supply
    And the faction technology panel is captured
    When the commander presses "Escape"
    Then the faction technology panel is closed
    And the commander has selected "builder"

  Scenario: Gnarl Brood unlocks spawning when its Nest finishes
    Given an RTS test scenario
      """
      {"name":"Gnarl technology","paused":true,"decor":false,
       "players":{"1":{"faction":"monsters"}},
       "map":{"width":96,"height":64},
       "units":[{"id":"builder","type":"forager","owner":1,"x":37,"y":22},
                {"id":"nest","type":"brood_nest","owner":1,"x":46,"y":25,"build_progress":0.96}]}
      """
    When the commander frames (42, 25) at zoom height 46
    And the commander clicks unit "builder"
    And the commander opens the faction technology panel
    Then the faction technology panel shows "monsters"
    And technology "blight_hurler" shows prerequisite "brood_nest" as "Building"
    And technology "blight_hurler" is "Locked" and costs 100 crystal, 100 aether, and 3 supply
    When the commander right-clicks terrain at (46, 25)
    And the simulation advances 230 ticks
    Then technology "blight_hurler" shows prerequisite "brood_nest" as "Complete"
    And technology "blight_hurler" is "Unlocked" and costs 100 crystal, 100 aether, and 3 supply
    And the faction technology panel is captured

  Scenario: Aurelian Concord shows a completed Waystone waiting for power
    Given an RTS test scenario
      """
      {"name":"Aurelian technology","paused":true,"decor":false,"victory":"all_structures",
       "players":{"1":{"faction":"aliens"}},
       "map":{"width":96,"height":64},
       "units":[{"id":"home","type":"heartstone","owner":1,"x":20,"y":25},
                {"id":"builder","type":"mote","owner":1,"x":38,"y":22},
                {"id":"resonator","type":"resonator","owner":1,"x":46,"y":25,"build_progress":0.93},
                {"id":"waystone","type":"waystone","owner":1,"x":53,"y":25},
                {"id":"enemy","type":"colony_hub","owner":2,"x":82,"y":50}]}
      """
    When the commander frames (43, 25) at zoom height 46
    And the commander clicks unit "builder"
    And the commander opens the faction technology panel
    Then the faction technology panel shows "aliens"
    And technology "waystone" shows prerequisite "resonator" as "Building"
    And technology "spire_walker" shows prerequisite "waystone" as "Complete"
    And technology "spire_walker" shows prerequisite "power" as "Missing"
    And technology "spire_walker" is "Unpowered" and costs 300 crystal, 200 aether, and 6 supply
    When the commander right-clicks terrain at (46, 25)
    And the simulation advances 250 ticks
    Then technology "waystone" shows prerequisite "resonator" as "Complete"
    And technology "spire_walker" shows prerequisite "power" as "Complete"
    And technology "spire_walker" is "Unlocked" and costs 300 crystal, 200 aether, and 6 supply
    And the faction technology panel is captured
