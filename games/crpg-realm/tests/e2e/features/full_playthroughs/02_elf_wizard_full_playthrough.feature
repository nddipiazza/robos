Feature: Elf Wizard Complete Campaign Slice Journey
  As Elf Wizard Aeloria awakening with arcane knowledge
  I want to prepare spells, unleash Magic Missile on the shadow hound, and defeat Captain Malakor
  So that the keep is liberated through arcane mastery

  Scenario: Elf Wizard Aeloria full playthrough from spell preparation to victory
    Given the cRPG game is running and healthy
    When the player selects race "elf" and class "wizard"
    And the player selects spells "magic-missile,fireball"
    And the player rolls character ability scores
    And the player embarks as "Aeloria"
    Then the current scene is "Homestead"
    And the hero race is "elf"
    And the hero knows spell "magic-missile"
    When the player speaks with partner Elora
    Then the active party contains 2 members
    When the player loots the footlocker
    When the player exits to Oakhaven Village Square
    Then the current scene is "VillageSquare"
    When the player speaks with Blacksmith Brand
    Then the blacksmith gives the "garrison-key" and quest advances to stage 3
    When the player traverses to the eastern ruins to confront the Corrupted Shadow Hound
    Then the shadow hound is visible on screen
    When the player presses the spacebar to pause the game
    Then the game simulation is paused with the RTwP banner visible
    When the player queues action "spell" on the action toolbar
    And the player unpauses the game
    Then the game simulation is unpaused
    When the player casts spell "magic-missile" at the Corrupted Shadow Hound
    Then the shadow hound is slain and total kills equals 1
    When the player enters the Royal Garrison Keep
    Then the current scene is "GarrisonKeep"
    When the player confronts Captain Malakor
    And the combat rounds against Captain Malakor are executed until victory
    Then the terminal victory screen is displayed with quest stage 5
