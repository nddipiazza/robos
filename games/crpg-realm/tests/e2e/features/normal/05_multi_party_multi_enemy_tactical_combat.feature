Feature: Multi-Party Multi-Enemy Tactical Combat Skirmish
  As a party of adventurers in the Realm of Heroes
  I want to coordinate multi-character tactical actions against a varied enemy pack
  So that party members can focus-fire, use ranged standoff, and defeat all threats in real-time with pause

  Background:
    Given the cRPG game is running and healthy
    And an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    Then the current scene is "TacticalBattle"
    And the tactical battle contains 3 enemies

  Scenario: Multi-party formation engaging varied enemy pack with combined arms
    A coordinated multi-character tactical engagement across three distinct party roles in real-time with pause.
    Lieutenant Vance provides heavy frontline greatsword strikes to suppress and eliminate the pack alpha.
    Companion Elora maintains ranged standoff with rapid bow fire against the lethal Crypt Skeleton Archer.
    Companion Thrumbar channels divine smites against the elusive Shadow Stalker, securing complete tactical victory.
    Then enemy "wolf_alpha" has at least 28 hit points
    And enemy "skeleton_archer" has at least 18 hit points
    And enemy "shadow_stalker" has at least 22 hit points
    When the player orders "vance" to attack enemy "wolf_alpha" 3 times
    Then the enemy "wolf_alpha" is defeated
    And the activity log contains message "Lieutenant Vance attacks Corrupted Wolf Alpha"
    When the player orders "elora" to attack enemy "skeleton_archer" 2 times
    Then the enemy "skeleton_archer" is defeated
    And the activity log contains message "Crypt Skeleton Archer was slain"
    When the player orders "thrumbar" to attack enemy "shadow_stalker" 2 times
    Then the enemy "shadow_stalker" is defeated
    And the activity log contains message "Shadow Stalker was slain"
    And the activity log contains message "Tactical Victory"
