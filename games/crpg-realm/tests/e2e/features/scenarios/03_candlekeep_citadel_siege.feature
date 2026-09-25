@real_crpg @scenario @citadel @large_map
Feature: Candlekeep Outer Ward Citadel Courtyard Siege
  As the defenders of Candlekeep monastery
  I want to repel an invading Iron Throne mercenary warband assaulting the Great Library grounds
  So that Gorion's sanctum and the sacred archives remain inviolate

  Background:
    Given the cRPG game is running and healthy
    And an isolated leveled adventure in scene "TacticalBattle" with party "candlekeep-siege"
    Then the current scene is "TacticalBattle"

  Scenario: Defenders hold the outer courtyard gates against mercenary crossbowmen
    When the mercenary crossbowmen unleash a volley from the perimeter walls
    Then commander "Vance" raises shield and party takes defensive formation
    When rogue "Elora" snipes the lead mercenary crossbowman with hunting bow
    Then the lead crossbowman is eliminated

  Scenario: Wizard unleashes 8d6 Fireball into the charging mercenary pack
    When the Iron Throne mercenaries and ogrillon brute charge the central courtyard path
    Then master "Ignis" channels 3rd-level evocation spell "fireball"
    When the wizard targets the mercenary pack and casts "fireball"
    Then a fiery projectile streaks to the target point and detonates in a 20ft radius explosion
    And the spell rolls authentic 8d6 fire damage
    And the mercenary pack is decimated by the blast
    And the activity log records the fiery explosion and mercenary deaths

  Scenario: Commander Vance duels the Iron Throne mercenary captain to victory
    When the wounded Iron Throne mercenary captain issues a final challenge
    Then commander "Vance" executes a decisive martial strike
    And the Iron Throne mercenary captain is vanquished
    Then the Candlekeep citadel courtyard is successfully defended
    And the terminal victory screen is displayed
