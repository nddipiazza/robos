@production_boost
Feature: A Heartstone pays energy for a timed production boost
  Scenario: A command-card cast accelerates only one powered queue and cannot stack
    Given an RTS test scenario
      """
      {"name":"Heartstone production boost","paused":true,"decor":false,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":1000,"aether":600}},
       "map":{"width":104,"height":64},
       "units":[{"id":"source","type":"heartstone","owner":1,"x":26,"y":24},
                {"id":"backup","type":"heartstone","owner":1,"x":26,"y":40},
                {"id":"boosted","type":"waystone","owner":1,"x":48,"y":24},
                {"id":"control","type":"waystone","owner":1,"x":57,"y":24},
                {"id":"power","type":"resonator","owner":1,"x":51,"y":34},
                {"id":"unpowered","type":"waystone","owner":1,"x":77,"y":24},
                {"id":"enemy","type":"colony_hub","owner":2,"x":90,"y":53}]}
      """
    When player 1 issues "train_spire_walker" to unit "boosted" toward (48.0, 24.0)
    And player 1 issues "train_spire_walker" to unit "control" toward (57.0, 24.0)
    And the commander frames (50, 28) at zoom height 70
    And the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "B"
    Then the command card is targeting "production_boost"
    When the commander clicks the projected body of "unpowered" at (0.0, 1.15)
    Then "source" has 50.0 Heartstone energy
    And "unpowered" has 0 boost ticks
    When the commander clicks the projected body of "boosted" at (0.0, 1.15)
    Then "source" has 0.0 Heartstone energy
    And "boosted" has 768 boost ticks
    And "control" has 0 boost ticks
    When a direct production boost from "backup" to "unpowered" is attempted
    Then the production boost attempt is rejected
    When a direct production boost from "backup" to "boosted" is attempted
    Then the production boost attempt is rejected
    And "backup" has 50.0 Heartstone energy
    And "boosted" has 768 boost ticks
    When the simulation advances 128 ticks
    Then "boosted" has 640 boost ticks
    And "source" has 1.5 Heartstone energy
    And "boosted" has 3.0 seconds of production progress
    And "control" has 2.0 seconds of production progress
    When the commander clicks the projected body of "boosted" at (0.0, 1.15)
    Then the boosted production timer is captured
    When the simulation advances 640 ticks
    Then "boosted" has 0 boost ticks
    And "boosted" has 18.0 seconds of production progress
    And "control" has 12.0 seconds of production progress
    When a direct production boost from "backup" to "boosted" is attempted
    Then the production boost attempt is accepted
    And "backup" has 9.0 Heartstone energy
    And "boosted" has 768 boost ticks

  Scenario: Power loss pauses production without banking boost time
    Given an RTS test scenario
      """
      {"name":"Power loss during a boost","paused":true,"decor":false,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":800,"aether":400}},
       "map":{"width":104,"height":64},
       "units":[{"id":"source","type":"heartstone","owner":1,"x":27,"y":26},
                {"id":"builder","type":"mote","owner":1,"x":49,"y":39},
                {"id":"boosted","type":"waystone","owner":1,"x":48,"y":25},
                {"id":"power","type":"resonator","owner":1,"x":45,"y":33,"hp":1,"shields":0},
                {"id":"backup_power","type":"resonator","owner":1,"x":58,"y":36,"build_progress":0.95},
                {"id":"gun","type":"howitzer_emplaced","owner":2,"x":72,"y":33},
                {"id":"enemy","type":"colony_hub","owner":2,"x":91,"y":54}]}
      """
    When player 2 issues "hold_fire" to unit "gun" toward (72.0, 33.0)
    And player 1 issues "train_spire_walker" to unit "boosted" toward (48.0, 25.0)
    And the commander frames (45, 29) at zoom height 56
    And the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "B"
    And the commander clicks the projected body of "boosted" at (0.0, 1.15)
    And the simulation advances 64 ticks
    Then "boosted" has 1.5 seconds of production progress
    When the opposing gun targets the Resonator
    And the simulation advances 32 ticks
    Then "boosted" is unpowered for production
    And "boosted" has 672 boost ticks
    When the commander records the production progress of "boosted"
    And the simulation advances 672 ticks
    Then "boosted" has 0 boost ticks
    And "boosted" production has advanced 0.0 seconds since the record
    When the commander clicks the projected body of "builder" at (0.0, 1.15)
    And the commander right-clicks terrain at (58, 36)
    And the simulation advances 250 ticks
    Then "boosted" is powered for production
    When the commander records the production progress of "boosted"
    And the simulation advances 64 ticks
    Then "boosted" production has advanced 1.0 seconds since the record
