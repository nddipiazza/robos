Feature: The first adventure in Ember Quest

  Scenario: Buy a sword, open a chest and defeat the boss
    Given a new game has started in Ashford Town
    Then the hero has 50 gold
    When the hero walks to the weapon shop
    And the hero buys the "Iron Sword"
    Then the hero has 10 gold
    And the hero carries the "Iron Sword"
    When the hero walks to the town chest
    Then the hero carries the "Ember Tonic"
    When the hero walks to Emberfall Cave
    Then the current map is Emberfall Cave
    When the hero walks to the Mossling
    And the hero fights until the battle ends
    Then "Mossling" has been defeated
    When the hero walks to the altar
    And the hero fights until the battle ends
    Then "Cinder Wyrm" has been defeated
    And the game shows the victory screen
