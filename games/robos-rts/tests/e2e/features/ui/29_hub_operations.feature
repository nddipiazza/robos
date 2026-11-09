@hub_operations
Feature: Upgrade and deploy temporary mining machinery
  Scenario: A Colony Hub pays to unlock and deploy a timed Prospector
    Given an RTS test scenario
      """
      {"name":"Prospector deployment", "paused":true, "decor":false, "fog_of_war":true,
       "map":{"width":96,"height":64},
       "units":[{"id":"hub","type":"colony_hub","owner":1,"x":20,"y":22},
                {"type":"muster_hall","owner":1,"x":24,"y":39}],
       "resources":[{"type":"crystal_field","x":34,"y":21,"amount":80}]}
      """
    When the commander clicks unit "hub"
    And the commander presses "U"
    And the simulation advances 480 ticks
    Then the Hub's field operations are upgraded
    When the commander presses "M"
    Then the command card is targeting "deploy_prospector"
    When the commander marks the Prospector's crystal field
    Then a Prospector is mining with a fresh deployment timer
    When the commander selects the Prospector
    Then the Prospector's timer is captured
    When the simulation advances 2880 ticks
    Then the Prospector is gone after its deployment expires
