@realtime
Feature: Live player versus AI matches on editor-authored maps
  The map editor creates and saves each scenario. The player controller uses
  ordinary paid commands while the built-in opponent runs independently.
  The live frame clock advances the match; these tests never call /step.

  Scenario Outline: An authored build-order match plays to its actual result
    Given the editor saves a "<build>" scenario against "<difficulty>" "<strategy>" AI with seed <seed>
    And the saved scenario opens as a paused playtest with the standard opening
    When the player plays the authored scenario on the live game clock
    Then the match has a valid structure-elimination result
    And both sides built and fought using their starting economies
    And the live clock advanced without manual simulation steps
    And the result stays frozen while the live application continues running

    Examples:
      | build   | difficulty | strategy | seed |
      | rush    | easy       | economy  | 42   |
      | siege   | normal     | balanced | 17   |
      | economy | hard       | rush     | 81   |
      | rush    | hard       | siege    | 29   |

  Scenario: The built-in AI defeats an unattended player in a live match
    Given the editor saves a "idle" scenario against "hard" "rush" AI with seed 6
    And the saved scenario opens as a paused playtest with the standard opening
    When the player plays the authored scenario on the live game clock
    Then the match has a valid structure-elimination result
    And the unattended player lost to the built-in AI
    And the live clock advanced without manual simulation steps
