@title_screen
Feature: Start and resume Starfall Command from its title screen
  Scenario: The menu opens settings and starts a skirmish that can resume
    Given Starfall Command is idle on the title screen
    And the title screen is captured
    When the commander clicks Settings on the title screen
    Then the title shows the "settings" page
    When the commander presses "Escape"
    Then the title shows the "main" page
    When the commander clicks Skirmish on the title screen
    Then the title shows the "skirmish" page
    When the commander chooses Iron Narrows and starts from the title
    Then Iron Narrows is running with finite deposits
    When the commander remembers the match and puts a worker in group 1
    And the commander returns to the title from the battlefield
    Then the match is paused at the title
    When the commander presses "Enter"
    Then the same match and control group resume
    When the commander returns to the title from the battlefield
    Then the title shows the "main" page

  Scenario: Practice scenarios and the map editor are available from the title
    When the commander clicks Scenarios on the title screen
    Then the title shows the "scenarios" page
    When the commander presses "Down"
    And the commander presses "Enter"
    Then Colony Macro Economy is open in the battlefield
    When the commander returns to the title from the battlefield
    And the commander clicks Map Editor on the title screen
    Then the map editor is open
