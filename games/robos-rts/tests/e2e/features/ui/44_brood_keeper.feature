@brood_keeper
Feature: Train a Brood Keeper and seed a delayed clutch
  Scenario: A paid Keeper uses the command card to grow two more Nest slots
    Given an RTS test scenario
      """
      {"name":"Brood Keeper","paused":true,"decor":false,"victory":"all_structures",
       "map":{"width":110,"height":72},
       "players":{"1":{"faction":"monsters"}},
       "units":[{"id":"nest","type":"brood_nest","owner":1,"x":30,"y":28},
                {"type":"colony_hub","owner":2,"x":95,"y":57}]}
      """
    When the commander clicks unit "nest"
    And the commander presses "E"
    Then player 1 has 275 crystal, 125 aether and 2 supply used
    And "nest" holds 2 brood slots with no clutch growing
    When the simulation advances 2200 ticks
    And the commander frames (35, 30) at zoom height 44
    And the commander selects the completed "brood_keeper"
    Then the active subgroup is "brood_keeper"
    And the battlefield is captured as "brood-keeper"
    When the commander presses "E"
    And the commander targets the Nest for a clutch
    And the simulation advances 1 ticks
    Then "nest" holds 3 brood slots with a clutch growing
    When the commander clicks unit "nest"
    Then the battlefield is captured as "brood-keeper-clutch"
    When the simulation advances 767 ticks
    Then "nest" holds 3 brood slots with a clutch growing
    When the simulation advances 1 ticks
    Then "nest" holds 5 brood slots with no clutch growing
