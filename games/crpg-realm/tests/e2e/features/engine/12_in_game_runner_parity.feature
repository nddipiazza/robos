@engine @desktop_only
Feature: The in-game demo runner plays the engine layer exactly like behave does
  Demo mode (and the browser build) runs the engine features inside the game with
  a GDScript port of the step library. This proves the port and the Python library
  agree: every engine scenario must also pass when the game runs it itself.
  Tagged @desktop_only so the in-game runner doesn't try to run itself.

  Scenario: Every engine scenario also passes in the in-game demo runner
    Then every engine scenario also passes in the in-game demo runner
