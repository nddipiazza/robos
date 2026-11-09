@roadmap_support
Feature: Paid healing and shield support
  Scenario: A trained specialist follows a wounded ally and spends energy treating them
    Given an RTS test scenario
      """
      {"name":"Field treatment","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":17,"y":20},
                {"id":"hall","type":"muster_hall","owner":1,"x":31,"y":25},
                {"id":"patient","type":"breacher","owner":1,"x":57,"y":25,"hp":20}]}
      """
    When the commander frames (43, 26) at zoom height 44
    And the commander clicks unit "hall"
    And the commander presses "E"
    Then player 1 has 325 crystal, 125 aether and 4 supply used
    When the simulation advances 420 ticks
    And the commander selects the completed "triage_specialist"
    And the commander right-clicks terrain at (57, 25)
    And the simulation advances 210 ticks
    Then "triage_specialist" spends energy supporting "patient"
    And the battlefield is captured as "field-treatment"

  Scenario: A Mote summons a relay inside a Resonator field
    Given an RTS test scenario
      """
      {"name":"Aegis field","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"mote","type":"mote","owner":1,"x":33,"y":29},
                {"type":"resonator","owner":1,"x":33,"y":22},
                {"id":"walker","type":"spire_walker","owner":1,"x":46,"y":27,"shields":1}]}
      """
    When the commander clicks unit "mote"
    And the commander presses "C"
    And the commander clicks a targeted point at (72, 27)
    Then no "aegis_relay" exists
    When the commander clicks a targeted point at (39, 27)
    And the simulation advances 530 ticks
    Then "aegis_relay" spends energy supporting "walker"
    When the commander selects the completed "aegis_relay"
    Then the battlefield is captured as "aegis-field"
