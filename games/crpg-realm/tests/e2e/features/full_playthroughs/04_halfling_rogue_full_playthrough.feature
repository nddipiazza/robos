Feature: Halfling Rogue Complete Campaign Slice Journey
  As Halfling Rogue Bramble swift and stealthy
  I want to equip my hunting bow, eliminate the corrupted hound from distance, and defeat Malakor
  So that the garrison is reclaimed through archery and cunning

  Scenario: Halfling Rogue Bramble full playthrough with ranged bow combat to victory
    Given the cRPG game is running and healthy
    When the player selects race "halfling" and class "rogue"
    And the player rolls character ability scores
    And the player embarks as "Bramble"
    Then the current scene is "Homestead"
    And the hero race is "halfling"
    When the player speaks with partner Elora
    Then the active party contains 2 members
    When the player loots the footlocker
    Then the hero inventory contains "hunting-bow"
    When the player exits to Oakhaven Village Square
    Then the current scene is "VillageSquare"
    When the player speaks with Blacksmith Brand
    Then the blacksmith gives the "garrison-key" and quest advances to stage 3
    When the player traverses to the eastern ruins to confront the Corrupted Shadow Hound
    Then the shadow hound is visible on screen
    When the player presses the spacebar to pause the game
    Then the game simulation is paused with the RTwP banner visible
    When the player queues action "attack" on the action toolbar
    And the player unpauses the game
    Then the game simulation is unpaused
    When the player executes a ranged weapon attack against the Corrupted Shadow Hound
    Then the shadow hound is slain and total kills equals 1
    When the player enters the Royal Garrison Keep
    Then the current scene is "GarrisonKeep"
    When the player confronts Captain Malakor
    And the combat rounds against Captain Malakor are executed until victory
    Then the terminal victory screen is displayed with quest stage 5
