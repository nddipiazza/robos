@production_attachments
Feature: A Muster Hall builds a Fabrication Module on its adjacent pad
  Scenario: Use the normal command card to build, cancel and replace an attachment
    Given an RTS test scenario
      """
      {"name":"Muster Hall attachment","paused":true,"decor":false,
       "map":{"width":96,"height":64},"players":{"1":{"crystal":200,"aether":100}},
       "units":[{"id":"hall","type":"muster_hall","owner":1,"x":30.5,"y":30}]}
      """
    When the commander clicks unit "hall"
    And the commander presses "X"
    Then player 1 has 150 crystal, 75 aether and 0 supply used
    When the commander selects the building at (36, 30)
    Then the active subgroup is "fabrication_module"
    When the commander presses "X"
    Then no building stands at (36, 30)
    And player 1 has 187 crystal, 93 aether and 0 supply used
    When the commander clicks unit "hall"
    And the commander presses "X"
    And the commander presses "X"
    And the simulation advances 300 ticks
    Then a finished "fabrication_module" stands at (36, 30)
    And player 1 has 137 crystal, 68 aether and 0 supply used
    And the battlefield is captured as "production-attachment"

  Scenario: The occupied pad leaves the command blocked and resources untouched
    Given an RTS test scenario
      """
      {"name":"Blocked attachment pad","paused":true,"decor":false,
       "map":{"width":96,"height":64},"players":{"1":{"crystal":200,"aether":100}},
       "units":[{"id":"hall","type":"muster_hall","owner":1,"x":30.5,"y":30},
                {"type":"silo","owner":1,"x":36,"y":30}]}
      """
    When the commander clicks unit "hall"
    And the commander presses "X"
    Then no "fabrication_module" exists
    And player 1 has 200 crystal, 100 aether and 0 supply used
