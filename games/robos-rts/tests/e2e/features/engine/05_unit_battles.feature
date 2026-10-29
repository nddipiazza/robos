@unit_battle
Feature: Repeatable unit battles
  Compare fixed armies on neutral ground using the real combat engine.

  Scenario: Ten Riflemen per side wait for Fight, resolve through combat, and reset exactly
    Given the RTS test scenario "riflemen-vs-riflemen" from the knowledge graph
    Then the Rifleman arena has two mirrored healthy squads ready at tick zero
    When the arena fight starts
    Then the arena fight resolves through combat within 60 game seconds
    And the completed arena rejects further commands and freezes its clock
    When the arena is reset
    Then the Rifleman arena has two mirrored healthy squads ready at tick zero
    When the arena fight starts
    Then the arena repeats the same combat result
