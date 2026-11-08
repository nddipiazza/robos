@iron_narrows
Feature: Iron Narrows supports a complete finite-resource duel
  Scenario: Both commanders build from finite deposits and fight through the crossings
    Given a finite Iron Narrows skirmish
    When the player plays the "rush" build at accelerated speed for up to 900 game seconds
    Then the match ends by destroying every structure of the defeated player
    And both commanders harvested resources and built their armies from scratch
    And the player produced a "rifleman" through the build order
    And the finished match rejects commands and freezes further simulation
