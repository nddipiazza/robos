Feature: Temple of Fiends Treasure Chests and Persistence
  As a dungeon explorer in the Temple of Fiends
  I want to open the unlocked treasure chests at (3, 3), (2, 3), and (2, 32) and verify opened chests stay empty
  So that dungeon loot and chest state persistence work reliably

  Scenario: Open all 3 unlocked chests in Temple of Fiends and verify empty chest message on re-search
    Given the game is launched on "TempleOfFiends" at tile (3, 4) facing "up" in virtual display Xvfb
    When the hero moves up 1 tiles
    And the hero uses the "SEARCH" command on the chest
    Then dialog is displayed with text containing "HEAL Potion"
    When the player advances the dialog page
    Then the item "HEAL Potion" is present in player inventory
    When the hero moves left 1 tiles
    And the hero uses the "SEARCH" command on the chest
    Then dialog is displayed with text containing "CABIN"
    When the player advances the dialog page
    Then the item "CABIN" is present in player inventory
    When the party teleports to tile (2, 33) facing "up"
    And the hero moves up 1 tiles
    And the hero uses the "SEARCH" command on the chest
    Then dialog is displayed with text containing "Cap"
    When the player advances the dialog page
    Then the item "Cap" is present in player inventory
    When the hero uses the "SEARCH" command on the chest
    Then dialog is displayed with text containing "The treasure chest is empty"
    When the player advances the dialog page
