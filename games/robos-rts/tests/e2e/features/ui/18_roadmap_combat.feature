@roadmap_combat
Feature: Selected weapon timing and visible splash warnings
  Scenario: A selected Howitzer shows its wind-up, impact area, and cooldown
    Given an RTS test scenario
      """
      {"name":"Artillery timing","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"gun","type":"howitzer_emplaced","owner":1,"x":28,"y":26},
                {"id":"target","type":"rifleman","owner":2,"x":50,"y":26,"hp":35}]}
      """
    When the commander frames (39, 26) at zoom height 40
    And the commander clicks unit "gun"
    Then the selected weapon reads "Ready"
    When the simulation advances 10 ticks
    Then the selected weapon reads "Wind-up"
    And the splash warning marks "target" with radius 3.5
    When the commander captures the artillery warning
    And the simulation advances 18 ticks
    Then the selected weapon reads "Cooldown"
    And no splash warning is visible
    When the simulation advances 150 ticks
    Then the selected weapon reads "Ready"

  Scenario: An artillery attack outside vision does not reveal the shooter
    Given an RTS test scenario
      """
      {"name":"Unseen artillery","paused":true,"decor":false,"fog_of_war":true,"map":{"width":96,"height":64},
       "units":[{"id":"gun","type":"howitzer_emplaced","owner":2,"x":24,"y":26},
                {"id":"target","type":"rifleman","owner":1,"x":51,"y":26}]}
      """
    When the simulation advances 10 ticks
    Then "gun" is winding up a shot
    And no splash warning is visible
