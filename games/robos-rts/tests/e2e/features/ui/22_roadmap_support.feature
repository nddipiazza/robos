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
                {"type":"waystone","owner":1,"x":26,"y":22},
                {"id":"walker","type":"spire_walker","owner":1,"x":46,"y":27,"shields":1}]}
      """
    When the commander clicks unit "mote"
    And the commander presses "B"
    And the commander presses "B"
    And the commander clicks a targeted point at (72, 27)
    Then no "aegis_relay" exists
    When the commander clicks a targeted point at (39, 27)
    And the simulation advances 530 ticks
    Then "aegis_relay" spends energy supporting "walker"
    When the commander selects the completed "aegis_relay"
    Then the battlefield is captured as "aegis-field"

  Scenario: Auto-Heal is on by default and manual healing works with it off
    Given an RTS test scenario
      """
      {"name":"Auto-Heal controls","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"medic","type":"triage_specialist","owner":1,"x":32,"y":28},
                {"id":"rifle","type":"rifleman","owner":1,"x":35,"y":28,"hp":20},
                {"id":"breacher","type":"breacher","owner":1,"x":38,"y":28,"hp":20}]}
      """
    When the commander clicks unit "medic"
    And the simulation advances 40 ticks
    Then "medic" has Auto-Heal on
    And "triage_specialist" spends energy supporting "breacher"
    When player 1 issues "attack_move" to unit "medic" toward (42.0, 28.0)
    And the simulation advances 16 ticks
    Then "medic" has orders "attack_move"
    And "triage_specialist" spends energy supporting "breacher"
    When the commander right-clicks command card slot 4
    Then "medic" has Auto-Heal off
    When the commander presses "E"
    And the commander clicks a targeted point at (35, 28)
    And the simulation advances 24 ticks
    Then "triage_specialist" spends energy supporting "rifle"
