@realtime @performance
Feature: Live play stays responsive during automation and recording
  Scenario: Slow control clients and recording do not stop the frame clock
    Given the editor saves a "idle" scenario against "hard" "rush" AI with seed 6
    And the saved scenario opens as a paused playtest with the standard opening
    When control clients deliver incomplete requests while the live game runs
    Then incomplete requests did not block the simulation or frame loop
    When a rendered frame is encoded asynchronously during live play
    Then the capture completed while simulation ticks continued
