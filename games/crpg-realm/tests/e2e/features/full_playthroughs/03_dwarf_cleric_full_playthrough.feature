Feature: Dwarf Cleric Complete Campaign Slice Journey
  As Dwarf Cleric Thrumbar guided by divine light
  I want to prepare Cure Wounds, heal with restorative prayer, smite the hound, and defeat Malakor
  So that the corruption is cleansed from Oakhaven

  Scenario: Dwarf Cleric Thrumbar full playthrough with divine healing to victory
    Given the cRPG game is running and healthy
    When the player selects race "dwarf" and class "cleric"
    And the player selects spells "cure-wounds"
    And the player rolls character ability scores
    And the player embarks as "Thrumbar"
    Then the current scene is "Homestead"
    And the hero race is "dwarf"
    And the hero knows spell "cure-wounds"
    When the player speaks with partner Elora
    Then the active party contains 2 members
    When the player loots the footlocker
    When the player exits to Oakhaven Village Square
    Then the current scene is "VillageSquare"
    When the player speaks with Blacksmith Brand
    Then the blacksmith gives the "garrison-key" and quest advances to stage 3
    When the player casts healing spell "cure-wounds"
    Then the hero hit points are restored
    When the player traverses to the eastern ruins to confront the Corrupted Shadow Hound
    Then the shadow hound is visible on screen
    When the player presses the spacebar to pause the game
    Then the game simulation is paused with the RTwP banner visible
    When the player queues action "spell" on the action toolbar
    And the player unpauses the game
    Then the game simulation is unpaused
    When the player attacks the Corrupted Shadow Hound
    Then the shadow hound is slain and total kills equals 1
    When the player enters the Royal Garrison Keep
    Then the current scene is "GarrisonKeep"
    When the player confronts Captain Malakor
    And the combat rounds against Captain Malakor are executed until victory
    Then the terminal victory screen is displayed with quest stage 5
