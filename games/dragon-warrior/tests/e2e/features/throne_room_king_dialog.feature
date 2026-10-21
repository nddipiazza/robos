Feature: King Lorik Dialogue Choices and Save Game State
  As a player
  I want to interact with King Lorik in the Throne Room
  So that I can view my experience progress, save my game state, and choose whether to continue my quest

  Scenario: King Lorik intro speech plays automatically on new game
    Given the game is launched on "ThroneRoom.tscn" in virtual display Xvfb
    Then dialog is displayed with text containing "Descendant of Erdrick"

  Scenario: Talk to King Lorik, view experience needed, and save game deeds
    Given the game is launched on "ThroneRoom.tscn" with king intro done with items "" at tile (4, 5) facing "up" in virtual display Xvfb
    Then no dialog is displayed
    When the hero approaches King Lorik at tile (4, 4) and selects TALK command
    Then dialog is displayed with text containing "I am greatly pleased"
    When the player advances the dialog page
    Then dialog is displayed with text containing "Before reaching thy next level"
    When the player advances the dialog page
    Then dialog is displayed with text containing "Will thou tell me now of thy deeds"
    And choice option "YES" is selected
    When the player confirms the choice option
    Then dialog is displayed with text containing "Imperial Scrolls of Honor"
    And the game state is saved to "user://saves/adventure_log.json"

  Scenario: Talk to King Lorik and choose not to continue quest
    Given the game is launched on "ThroneRoom.tscn" with king intro done with items "" at tile (4, 5) facing "up" in virtual display Xvfb
    Then no dialog is displayed
    When the hero approaches King Lorik at tile (4, 4) and selects TALK command
    Then dialog is displayed with text containing "I am greatly pleased"
    When the player advances the dialog page
    Then dialog is displayed with text containing "Before reaching thy next level"
    When the player advances the dialog page
    Then dialog is displayed with text containing "Will thou tell me now of thy deeds"
    When the player confirms the choice option
    Then dialog is displayed with text containing "Imperial Scrolls of Honor"
    When the player advances the dialog page
    Then dialog is displayed with text containing "Dost thou wish to continue"
    And choice option "NO" is selected
    When the player confirms the choice option
    Then dialog is displayed with text containing "Rest then for awhile"
