@crowd_navigation
Feature: Individual units find routes around allied crowds
  A rear unit should seek a clear firing position without shoving a holding line.

  Scenario Outline: A blocked Rifleman flanks nine hold-position teammates
    Given a "<layout>" allied holding-line fixture
    When the rear Rifleman seeks the enemy for up to 10 game seconds
    Then it fires after crossing outside the allied line
    And every holding unit remains in its original position

    Examples:
      | layout   |
      | normal   |
      | mirrored |
