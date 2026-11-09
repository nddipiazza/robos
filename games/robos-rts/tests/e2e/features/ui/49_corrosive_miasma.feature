@corrosive_miasma
Feature: The Blight Spire unlocks a timed area denial spell
  Scenario: A paid Spire lets a Hurler warn and deny an occupied crossing
    Given an RTS test scenario
      """
      {"name":"Corrosive Miasma","paused":true,"decor":false,
       "players":{"1":{"faction":"monsters"}},"map":{"width":96,"height":64},
       "units":[{"id":"nest","type":"brood_nest","owner":1,"x":18,"y":26},
                {"id":"builder","type":"forager","owner":1,"x":29,"y":20},
                {"id":"caster","type":"blight_hurler","owner":1,"x":35,"y":28},
                {"id":"worker","type":"pioneer","owner":2,"x":47,"y":28}]}
      """
    When the commander frames (38, 27) at zoom height 45
    And the commander clicks unit "caster"
    And the commander presses "K"
    And the commander presses "E"
    Then the miasma field is absent
    When the commander clicks unit "builder"
    And the commander presses "T"
    And the commander clicks a targeted point at (34, 17)
    And the simulation advances 1100 ticks
    Then player 1 has 200 crystal, 0 aether and 3 supply used
    When the commander clicks unit "caster"
    And the commander presses "E"
    And the commander clicks a targeted point at (47, 28)
    Then the miasma field shows a warning with 64 ticks remaining
    And the battlefield is captured as "miasma-warning"
    When the simulation advances 64 ticks
    Then the miasma field is active with 512 ticks remaining
    And "worker" has taken damage
    And the battlefield is captured as "miasma-active"
    When the simulation advances 512 ticks
    Then the miasma field is absent
