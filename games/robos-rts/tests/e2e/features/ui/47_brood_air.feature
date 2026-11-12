@brood_air
Feature: Brood flyers hatch from the paid Nest command card
  Scenario: A supply scout and light harasser both fly across a blocked ground route
    Given an RTS test scenario
      """
      {"name":"Brood flyers","paused":true,"decor":false,"fog_of_war":true,
       "players":{"1":{"faction":"monsters"}},
       "map":{"width":112,"height":64,"obstacles":[{"x":47,"y":0,"w":8,"h":64}]},
       "units":[{"id":"nest","type":"brood_nest","owner":1,"x":23,"y":27},
                {"id":"worker","type":"pioneer","owner":2,"x":75,"y":27}]}
      """
    When the commander frames (47, 29) at zoom height 60
    And the commander clicks unit "nest"
    And the commander presses "F"
    Then player 1 has 300 crystal, 150 aether and 0 supply used
    When the simulation advances 420 ticks
    Then player 1 has supply cap of at least 23
    When the commander selects the completed "drift_sac"
    And the commander presses "M"
    And the commander clicks a targeted point at (65, 23)
    And the simulation advances 840 ticks
    Then "drift_sac" has flown over the Brood air test wall
    When the commander frames (64, 26) at zoom height 48
    Then the battlefield is captured as "brood-drift-scout"
    When the commander frames (47, 29) at zoom height 60
    And the commander clicks unit "nest"
    And the commander presses "N"
    Then player 1 has 200 crystal, 50 aether and 0 supply used
    When the simulation advances 470 ticks
    And the commander selects the completed "needlewing"
    And the commander right-clicks terrain at (75, 27)
    And the simulation advances 390 ticks
    Then "needlewing" has flown over the Brood air test wall
    And "worker" has taken damage
    When the commander frames (69, 28) at zoom height 48
    Then the battlefield is captured as "brood-needlewing-raid"
