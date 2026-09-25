@engine
Feature: Attack rolls, advantage and critical hits
  A level-1 human fighter (STR 16, longsword +5 to hit, 1d8+3 slashing) fights a
  corrupted guard (AC 14, 16 HP). Scripted dice make every outcome exact.

  Background:
    Given a cRPG test scenario "Attack rules" with seed 11
    And the party
      | id    | class   | race     | level | x  | y |
      | vance | fighter | human    | 1     | 0  | 0 |
      | elora | rogue   | half-elf | 3     | 0  | 5 |
      | tarn  | ranger  | human    | 1     | 0  | 30 |
    And the enemies
      | id    | monster         | x | y |
      | guard | corrupted-guard | 5 | 0 |
      | sentry| corrupted-guard | 60| 60|
    And the scenario is loaded

  Scenario: A combatant's stats are derived from its class, race, level and kit
    Then "vance" has 12 max HP and AC 18
    And "guard" has 16 max HP and AC 14

  Scenario: A natural 20 is a critical hit that doubles the damage dice
    Given the next d20 roll is 20
    And the next d8 rolls are 4, 5
    When "vance" attacks "guard"
    Then the attack is a critical hit
    And "guard" took 12 slashing damage
    And "guard" has 4 HP
    And the engine audit is clean

  Scenario: A natural 1 always misses
    Given the next d20 roll is 1
    When "vance" attacks "guard"
    Then the attack misses
    And "guard" has full HP

  Scenario: Meeting the target's AC exactly is a hit, one less is a miss
    Given the next d20 rolls are 9, 8
    And the next d8 roll is 1
    When "vance" attacks "guard"
    Then the attack hits
    And "guard" has 12 HP
    When "vance" attacks "guard"
    Then the attack misses

  Scenario: Attacking a prone target in melee gives advantage
    Given "guard" is prone for 3 rounds
    And the next d20 rolls are 3, 17
    When "vance" attacks "guard"
    Then the attack was rolled with advantage
    And the attack hits

  Scenario: A poisoned attacker rolls with disadvantage
    Given "vance" is poisoned for 3 rounds
    And the next d20 rolls are 17, 3
    When "vance" attacks "guard"
    Then the attack was rolled with disadvantage
    And the attack misses

  Scenario: Advantage and disadvantage cancel out to a single roll
    Given "guard" is prone for 3 rounds
    And "vance" is poisoned for 3 rounds
    And the next d20 roll is 10
    When "vance" attacks "guard"
    Then the attack hits
    And the engine audit is clean

  Scenario: Any hit on a paralyzed creature from within 5 feet is a critical hit
    Given "guard" is paralyzed for 3 rounds
    And the next d20 rolls are 10, 6
    And the next d8 rolls are 2, 2
    When "vance" attacks "guard"
    Then the attack is a critical hit
    And "guard" took 7 slashing damage

  Scenario: A ranged attack with a hostile within 5 feet has disadvantage
    Given "tarn" is standing at 10,0
    And the next d20 rolls are 18, 4
    When "tarn" attacks "guard"
    Then the attack was rolled with disadvantage

  Scenario: A rogue adds sneak attack when an ally is next to the target
    Given the next d20 roll is 15
    And the next d6 rolls are 1, 2, 3
    When "elora" attacks "guard"
    Then the attack hits
    And "guard" took 9 piercing damage
    And the damage included 2d6 of sneak attack

  Scenario: A target out of reach can't be attacked with a melee weapon
    Given "vance" is standing at 0,40
    When "vance" attacks "guard"
    Then the action is refused because "out_of_range"

  Scenario: A dead creature can't be attacked
    Given "guard" is at 0 HP
    When "vance" attacks "guard"
    Then the action is refused because "target_dead"
    And "guard" is dead
