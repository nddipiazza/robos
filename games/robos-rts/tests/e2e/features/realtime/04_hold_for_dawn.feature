@realtime @hold_for_dawn
Feature: Hold for Dawn plays through to evacuation
  Scenario: Hold the outpost and recover the stranded militia
    Given the real Hold for Dawn campaign opens
    When the commander holds both bridges and leads the rescue expeditions
    Then the transport reaches the pad with all three militia squads rescued
    And the live clock advanced without manual simulation steps
