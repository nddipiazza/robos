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

  Scenario: Train two light units together and refund one line from the command card
    Given an RTS test scenario
      """
      {"name":"Dual production","paused":true,"decor":false,
       "map":{"width":96,"height":64},"players":{"1":{"crystal":300,"aether":100}},
       "units":[{"type":"colony_hub","owner":1,"x":16,"y":18},
                {"id":"hall","type":"muster_hall","owner":1,"x":30.5,"y":30}]}
      """
    When the commander clicks unit "hall"
    And the commander presses "X"
    And the simulation advances 300 ticks
    And the commander presses "A"
    And the commander presses "A"
    And the simulation advances 64 ticks
    Then "hall" runs 2 paid production lines
    And player 1 has 150 crystal, 75 aether and 2 supply used
    And the battlefield is captured as "dual-production"
    When the commander cancels production slot 2
    Then "hall" runs 1 paid production line
    And player 1 has 200 crystal, 75 aether and 1 supply used

  Scenario: Research Efficient Surge on the same pad instead of dual production
    Given an RTS test scenario
      """
      {"name":"Infantry research module","paused":true,"decor":false,
       "map":{"width":96,"height":64},"players":{"1":{"crystal":400,"aether":250}},
       "units":[{"type":"colony_hub","owner":1,"x":16,"y":18},
                {"id":"hall","type":"muster_hall","owner":1,"x":30.5,"y":30},
                {"id":"rifle","type":"rifleman","owner":1,"x":44,"y":34,"hp":8}]}
      """
    When the commander clicks unit "rifle"
    And the commander presses "T"
    Then "rifle" has 8 HP and 0 seconds of Surge
    When the commander clicks unit "hall"
    And the commander presses "T"
    Then player 1 has 400 crystal, 250 aether and 1 supply used
    When the commander presses "C"
    And the commander presses "X"
    And the simulation advances 300 ticks
    Then a finished "research_module" stands at (36, 30)
    And no "fabrication_module" exists
    When the commander presses "T"
    And the simulation advances 64 ticks
    Then "hall" runs 1 paid production line
    And player 1 has 250 crystal, 100 aether and 1 supply used
    And the battlefield is captured as "infantry-research"
    When the simulation advances 700 ticks
    And the commander clicks unit "rifle"
    And the commander presses "T"
    Then "rifle" has 3 HP and 11 seconds of Surge
