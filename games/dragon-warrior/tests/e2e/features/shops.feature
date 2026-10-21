Feature: Shop interactions and table tile dialogs
  As a player
  I want to travel to shop owners or stand in front of their table tiles
  So that I can talk to merchants and open shop dialogue menus

  Scenario: Brecconary Weapon Shop interaction via desk tile
    Given the game is launched on "Brecconary.tscn" at tile (6, 7) facing "up"
    When the player opens the command menu and selects the "TALK" command
    Then dialog is displayed with text containing "WHAT DOST THOU WANT?"

  Scenario: Tantegel Castle Key Shop interaction via desk tile
    Given the game is launched on "Castle1F.tscn" at tile (25, 4) facing "up"
    When the player opens the command menu and selects the "TALK" command
    Then dialog is displayed with text containing "WHAT DOST THOU WANT?"

  Scenario: Rimuldar Key Shop interaction via desk tile
    Given the game is launched on "Rimuldar.tscn" at tile (5, 6) facing "down"
    When the player opens the command menu and selects the "TALK" command
    Then dialog is displayed with text containing "WHAT DOST THOU WANT?"

  Scenario: Cantlin Weapon Shop interaction via desk tile
    Given the game is launched on "Cantlin.tscn" at tile (21, 5) facing "right"
    When the player opens the command menu and selects the "TALK" command
    Then dialog is displayed with text containing "WHAT DOST THOU WANT?"
