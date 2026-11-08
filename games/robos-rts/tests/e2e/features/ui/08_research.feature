@research
Feature: The Workshop researches lasting combat upgrades
  Scenario: Research uses resources and queue slots without reserving supply
    Given an RTS test scenario
      """
      {"name":"Workshop research","paused":true,"decor":false,"map":{"width":96,"height":64},
       "players":{"1":{"crystal":500,"aether":350}},
       "units":[{"type":"colony_hub","owner":1,"x":19,"y":24},
                {"id":"lab","type":"workshop","owner":1,"x":31,"y":26},
                {"id":"soldier","type":"rifleman","owner":1,"x":38,"y":30}]}
      """
    When the commander clicks unit "lab"
    And the commander presses "W"
    And the commander presses "W"
    And the commander presses "G"
    Then "lab" has 2 units in production
    And player 1 has 300 crystal, 150 aether and 1 supply used
    And the Workshop research controls are captured
    When the commander cancels production slot 2
    And the simulation advances 640 ticks
    Then Meridian Guard has weapons level 1 and armor level 0
    And player 1 has 400 crystal, 250 aether and 1 supply used
    When the commander presses "G"
    And the simulation advances 640 ticks
    Then Meridian Guard has weapons level 1 and armor level 1
    And player 1 has 300 crystal, 150 aether and 1 supply used
