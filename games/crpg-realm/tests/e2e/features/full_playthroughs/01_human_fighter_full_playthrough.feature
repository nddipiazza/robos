Feature: Human Fighter Complete Campaign Slice Journey
  As Human Fighter Lieutenant Vance awakening in Oakhaven
  I want to investigate the disturbance, defeat the corrupted hound, and infiltrate the keep
  So that I vanquish Captain Malakor and achieve victory for the realm

  Scenario: Human Fighter Vance full playthrough from awakening to victory
    Given the cRPG game is running and healthy
    When the player selects race "human" and class "fighter"
    And the player rolls character ability scores
    And the player embarks as "Lieutenant Vance"
    Then the current scene is "Homestead"
    When the player speaks with partner Elora
    Then the active party contains 2 members
    And the activity log contains dialogue answer "I... I honestly don't remember anything after midnight."
    When the player scrolls up the activity log to review conversation history
    Then the activity log scroll position is scrolled up
    When the player loots the footlocker
    Then the hero inventory contains "service-sword"
    And the status bar does not display inventory as a text list
    And the action toolbelt is visible on the status bar with quick actions
    And the legacy single hero toolbar is not present on the bottom hud
    When the player triggers toolbelt action "heal"
    When the player exits to Oakhaven Village Square
    Then the current scene is "VillageSquare"
    When the player speaks with Blacksmith Brand
    Then the blacksmith gives the "garrison-key" and quest advances to stage 3
    And the activity log contains dialogue answer "The garrison gates are barred. Can you help me enter?"
    When the player opens the shopkeeper trading window
    Then the shopkeeper trading window is visible
    When the player trades with the shopkeeper to buy "potion-healing"
    And the player closes the shopkeeper trading window
    When the player traverses to the eastern ruins to confront the Corrupted Shadow Hound
    Then the shadow hound is visible on screen
    When the player presses the spacebar to pause the game
    Then the game simulation is paused with the RTwP banner visible
    When the player queues action "attack" on the action toolbar
    And the player unpauses the game
    Then the game simulation is unpaused
    When the player attacks the Corrupted Shadow Hound
    Then the shadow hound is slain and total kills equals 1
    When the player enters the Royal Garrison Keep
    Then the current scene is "GarrisonKeep"
    When the player confronts Captain Malakor
    And the combat rounds against Captain Malakor are executed until victory
    Then the terminal victory screen is displayed with quest stage 5
