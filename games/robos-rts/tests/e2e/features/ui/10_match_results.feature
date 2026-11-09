@match_results
Feature: Finish a match, review it and replay the same opening
  Scenario: A scorecard records both economies and a rematch keeps the opening
    Given a Frontier Hunters match on "normal" difficulty with "siege" AI and seed 4
    When the simulation advances 640 ticks
    And the commander queues a worker and starts a selection drag before surrender
    And the commander surrenders and records the finished match
    Then the scorecard shows both commanders' mining totals
    When the commander presses "Ctrl+Enter"
    And the commander releases the pre-rematch selection drag
    Then the same opening is ready with fresh scores
