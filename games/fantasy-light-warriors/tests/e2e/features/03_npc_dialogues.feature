Feature: Town Villager, King of Coneria, and Princess Sara Dialogues
  As the 4 Light Warriors
  I want to speak with townsfolk in Coneria and the royal family in Coneria Castle 2F
  So that story flags (talked_coneria_guard, king_intro_done, lute_obtained) advance properly

  Scenario: Speak with the Coneria gate villager and the King of Coneria
    Given the game is launched on "Coneria" at tile (17, 20) facing "right" in virtual display Xvfb
    When the player talks to the NPC in front of the hero
    Then dialog is displayed with text containing "Coneria, the dream city"
    When the player advances the dialog page
    Then the game flag "talked_coneria_guard" is true
    When the party enters "ConeriaCastle2F" at tile (12, 5) facing "up"
    And the player talks to the NPC in front of the hero
    Then dialog is displayed with text containing "Garland has kidnapped"
    When the player advances the dialog page
    Then the game flag "king_intro_done" is true
    When the party teleports to tile (11, 6) facing "up"
    And the player talks to the NPC in front of the hero
    Then dialog is displayed with text containing "LUTE"
    When the player advances the dialog page
    Then the game flag "lute_obtained" is true
    And the item "Lute" is present in player inventory
