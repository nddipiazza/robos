@engine
Feature: Any scenario: randomly generated battles
  The Infinity AI plays hundreds of scenarios generated from the content data:
  random parties (any class, race and level 1-9), random monsters and positions.
  Every battle must finish with a clean audit, and replaying the same seed must
  produce the identical event log.

  Scenario Outline: <count> random battles from fuzz seed <seed>
    When the Infinity AI plays <count> random scenarios from seed <seed>
    Then every random battle finished with a clean audit
    And every random battle replayed identically

    Examples:
      | seed | count |
      | 1    | 100   |
      | 2    | 100   |
      | 3    | 100   |
      | 2024 | 100   |
