Feature: Infinity Engine RTwP Pause, Party Management, Shopkeeper Trading & Status Effects
  As a player experiencing Infinity Engine party-based RPG systems
  I want spacebar Real-Time with Pause, multi-member party management, shop trading, and status icons
  So that tactical D&D 5e encounters and inventory economy are fully verified

  Scenario: Spacebar RTwP pause, party management, and shopkeeper economy
    Given the cRPG game is running and healthy
    And an isolated test starting in scene "Homestead" with party "Lieutenant Vance" the "fighter"
    Then the current scene is "Homestead"
    When the player speaks with partner Elora
    Then the active party contains 2 members
    And the physical party companion is active in the world
    When the player loots the footlocker
    And the player presses the spacebar to pause the game
    Then the game simulation is paused with the RTwP banner visible
    When the player selects party member 1
    And the player queues action "attack" on the action toolbar
    And the player selects all party members
    When the player unpauses the game
    Then the game simulation is unpaused
    When status effect "poisoned" is applied to "Lieutenant Vance"
    Then the party member "Lieutenant Vance" has status effect "poisoned"
    And the status bar does not display inventory as a text list
    And the action toolbelt is visible on the status bar with quick actions
    And the legacy single hero toolbar is not present on the bottom hud
    When the player triggers toolbelt action "antidote"
    Then the party member "Lieutenant Vance" does not have status effect "poisoned"
    When the player exits to Oakhaven Village Square
    Then the current scene is "VillageSquare"
    And the physical party companion is active in the world
    When the player speaks with Blacksmith Brand
    Then the blacksmith gives the "garrison-key" and quest advances to stage 3
    When the player opens the shopkeeper trading window
    Then the shopkeeper trading window is visible
    When the player trades with the shopkeeper to buy "service-sword"
    And the player sells "service-sword" to the shopkeeper
    And the player closes the shopkeeper trading window
    When the player traverses to the eastern ruins to confront the Corrupted Shadow Hound
    Then the shadow hound is visible on screen
    When the player attacks the Corrupted Shadow Hound
    Then the shadow hound is slain and total kills equals 1
