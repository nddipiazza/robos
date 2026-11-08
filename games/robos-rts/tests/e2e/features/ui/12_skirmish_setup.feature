@skirmish_setup
Feature: Choose a duel, display settings and a postgame perspective
  Scenario: The match menu starts Iron Narrows with finite deposits
    Given an RTS test scenario
      """
      {"name":"Match setup","paused":true,"decor":false,"map":{"width":96,"height":64},"units":[]}
      """
    When the commander presses "F8"
    And the commander chooses Iron Narrows in the map picker
    Then the setup uses finite deposits
    When the commander changes and restores the overhead health-bar mode
    And the commander starts the selected skirmish
    Then Iron Narrows is running with finite deposits

  Scenario: Observer mode can inspect the AI and then restore player fog
    Given a Frontier Hunters match on "normal" difficulty with "siege" AI and seed 4
    When the commander surrenders and records the finished match
    And the commander presses "O"
    Then the observer can select the hidden enemy base
    When the commander presses "O"
    Then the observer sees through player 1's fog again
