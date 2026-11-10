@title_screen
Feature: Start and resume Starfall Command from its title screen
  Scenario: The menu opens settings and starts a skirmish that can resume
    Given Starfall Command is idle on the title screen
    And the title screen is captured
    When the commander clicks Settings on the title screen
    Then the title shows the "settings" page
    And Alt+Enter and Shift+F11 toggle fullscreen without leaving Settings
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

  @campaign
  Scenario: The first victory unlocks the White Ridge mission
    Given the title shows the "main" page
    When the commander clicks Campaign on the title screen
    Then the title shows the "campaign" page
    And campaign mission access is [true, false, false]
    When the commander presses "Enter"
    Then mission 1 begins with its voiced cinematic
    When the commander skips the cinematic and clears the route
    Then Cut the Signal is complete and five survivors have joined
    When the commander opens the replay picker from the campaign result
    Then the restart picker defaults to "normal"
    When the commander presses "Escape"
    Then the campaign result is visible again
    When the commander presses "Shift+Tab"
    And the commander presses "Enter"
    Then mission 2 begins with its voiced cinematic
    When the commander opens the restart picker from the pause menu
    Then the restart picker defaults to "normal"
    When the commander presses "Escape"
    Then the campaign pause menu is visible again
    When the commander presses "Enter"
    And the commander selects the next difficulty and confirms restart
    Then mission 2 begins with its voiced cinematic
    And the active mission difficulty is "hard"
    When the commander skips the cinematic and waits for the first Directorate raid
    Then the dig site is sending raiders toward the staging base
    When the commander leaves the campaign for the title
    And the commander clicks Campaign on the title screen
    Then the title shows the "campaign" page
    And campaign mission access is [true, true, false]
    When the commander presses "Escape"
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
