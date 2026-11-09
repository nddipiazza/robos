@crownspire
Feature: A late-tech Crownspire attacks Massive units and loses to cheaper interceptors
  Scenario: Build the prerequisite and train an anti-capital Crownspire through the command card
    Given an RTS test scenario
      """
      {"name":"Crownspire late-tech combat","paused":true,"decor":false,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":900,"aether":500}},
       "map":{"width":112,"height":70},
       "units":[{"id":"heart","type":"heartstone","owner":1,"x":19,"y":29},
                {"id":"source","type":"waystone","owner":1,"x":30,"y":22},
                {"id":"power","type":"resonator","owner":1,"x":29,"y":31},
                {"id":"mote","type":"mote","owner":1,"x":34,"y":42},
                {"id":"mortar","type":"howitzer_emplaced","owner":2,"x":64,"y":25},
                {"id":"massive","type":"spire_walker","owner":2,"x":74,"y":25},
                {"id":"enemy","type":"colony_hub","owner":2,"x":103,"y":58}]}
      """
    When player 2 issues "hold_fire" to unit "mortar" toward (64.0, 25.0)
    And player 2 issues "hold_fire" to unit "massive" toward (74.0, 25.0)
    And the commander frames (45, 30) at zoom height 76
    And the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "N"
    Then "source" has 0 units in production
    And a direct Crownspire production request is rejected
    And player 1 has 900 crystal, 500 aether and 1 supply used
    When the commander opens the faction technology panel
    Then technology "crownspire" is "Locked" and costs 400 crystal, 300 aether, and 8 supply
    And technology "crownspire" shows prerequisite "aegis_relay" as "Missing"
    When the commander presses "Escape"
    And the commander clicks the projected body of "mote" at (0.0, 1.15)
    And the commander presses "C"
    And the commander clicks a targeted point at (36, 37)
    And the simulation advances 128 ticks
    And the commander opens the faction technology panel
    Then technology "crownspire" shows prerequisite "aegis_relay" as "Building"
    And a direct Crownspire production request is rejected
    When the simulation advances 1728 ticks
    Then technology "crownspire" is "Unlocked" and costs 400 crystal, 300 aether, and 8 supply
    And technology "crownspire" shows prerequisite "aegis_relay" as "Complete"
    When the commander presses "Escape"
    And the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "N"
    Then player 1 has 400 crystal, 200 aether and 9 supply used
    When the simulation advances 4351 ticks
    Then no "crownspire" exists
    When the simulation advances 1 ticks
    And the commander selects the completed "crownspire"
    And the commander presses "K"
    And the commander right-clicks terrain at (55, 25)
    And the simulation advances 320 ticks
    Then the Crownspire is airborne near (55, 25)
    And the ground-only mortar cannot target the Crownspire
    When the commander right-clicks the projected body of "mortar" at (0.0, 1.15)
    Then the first Crown Lance hit removes 17 vitals from "mortar"
    When the commander frames (64, 24) at zoom height 44
    And the commander right-clicks the projected body of "massive" at (0.0, 2.45)
    Then the first Crown Lance hit removes 80 vitals from "massive"
    And the Crownspire is at full health and shields
    And the battlefield is captured as "crownspire-lance"

  Scenario: Two paid Kestrels beat a Crownspire in an air engagement
    Given an RTS test scenario
      """
      {"name":"Kestrel counter wing","paused":true,"decor":false,"victory":"all_structures",
       "players":{"1":{"faction":"humans","crystal":400,"aether":250}},
       "map":{"width":118,"height":68},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":18,"y":31},
                {"id":"hall","type":"muster_hall","owner":1,"x":27,"y":38},
                {"id":"hangar","type":"airframe_hangar","owner":1,"x":34,"y":24},
                {"id":"capital","type":"crownspire","owner":2,"x":86,"y":24},
                {"id":"enemy","type":"heartstone","owner":2,"x":108,"y":54}]}
      """
    When player 2 issues "hold_fire" to unit "capital" toward (86.0, 24.0)
    And the commander frames (61, 28) at zoom height 88
    And the commander clicks the projected body of "hangar" at (0.0, 1.15)
    And the commander presses "A"
    And the commander presses "A"
    Then player 1 has 150 crystal, 50 aether and 6 supply used
    When the simulation advances 3840 ticks
    And the commander selects the two paid Kestrels
    And player 2 issues "hold_fire" to unit "capital" toward (86.0, 24.0)
    And the commander right-clicks the airborne unit "capital"
    And the simulation advances 1024 ticks
    Then the affordable Kestrel wing wins the air engagement
