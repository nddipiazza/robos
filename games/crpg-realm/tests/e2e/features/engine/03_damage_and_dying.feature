@engine
Feature: Damage types, dropping to 0 HP, death saves and healing
  Resistance halves damage, vulnerability doubles it, immunity ignores it.
  Monsters die at 0 HP; player characters fall unconscious and make death saves.

  Background:
    Given a cRPG test scenario "Damage and dying" with seed 21
    And the party
      | id       | class  | race  | level | x | y  | spells                     |
      | vance    | fighter| human | 1     | 0 | 0  |                            |
      | thrumbar | cleric | dwarf | 1     | 0 | 10 | cure-wounds, healing-word  |
      | ignis    | wizard | human | 1     | 5 | 10 | magic-missile              |
      | mage     | wizard | elf   | 5     | 20| 60 | stinking-cloud             |
    And the enemies
      | id       | monster              | x  | y  |
      | golem    | ancient-stone-golem  | 5  | 0  |
      | skeleton | skeleton             | 5  | 15 |
      | zombie   | zombie               | 60 | 60 |
      | malakor  | captain-malakor-boss | 10 | 10 |
    And the scenario is loaded

  Scenario: Weapon damage against a resistant golem is halved, rounding down
    Given the next d20 roll is 15
    And the next d8 roll is 6
    When "vance" attacks "golem"
    Then "golem" took 4 slashing damage
    And the event log shows "(resistant)"
    And the engine audit is clean

  Scenario: Bludgeoning damage against a skeleton is doubled
    Given the next d20 roll is 15
    And the next d6 roll is 3
    When "thrumbar" attacks "skeleton"
    Then "skeleton" took 10 bludgeoning damage
    And "skeleton" has 3 HP

  Scenario: A zombie ignores poison damage and can't be poisoned
    Given the next d20 roll is 1
    When "mage" casts "stinking-cloud" at point 60,60
    Then "zombie" took 0 poison damage
    And "zombie" is not poisoned
    And the event log shows "immune to poisoned"
    And the engine audit is clean

  Scenario: A monster reduced to 0 HP dies
    Given "skeleton" is at 2 HP
    And the next d20 roll is 15
    When "thrumbar" attacks "skeleton"
    Then "skeleton" is dead

  Scenario: A player character reduced to 0 HP falls unconscious instead of dying
    Given "ignis" is at 3 HP
    And the next d20 roll is 15
    And the next d10 roll is 1
    When "malakor" attacks "ignis"
    Then "ignis" has 0 HP
    And "ignis" is unconscious
    And "ignis" is alive
    And "ignis" is down

  Scenario: Damage that overflows past 0 by the character's max HP kills outright
    Given "ignis" is at 1 HP
    And the next d20 roll is 15
    And the next d10 roll is 10
    When "malakor" attacks "ignis"
    Then "ignis" is dead
    And the event log shows "massive damage"

  Scenario: Death saves: a natural 20 brings the character back with 1 HP
    Given "ignis" is at 0 HP
    And the next d20 roll is 20
    When the Infinity AI plays "ignis"'s turn
    Then "ignis" is not unconscious
    And "ignis" is standing
    And the event log shows "natural 20 death save"

  Scenario: Death saves: a natural 1 counts as two failures, and a third failure kills
    Given "ignis" is at 0 HP
    And the next d20 roll is 1
    When the Infinity AI plays "ignis"'s turn
    Then "ignis" has 0 death save successes and 2 failures
    Given the next d20 roll is 9
    When the Infinity AI plays "ignis"'s turn
    Then "ignis" is dead

  Scenario: Three successful death saves stabilize the character
    Given "ignis" is at 0 HP
    And the next d20 rolls are 10, 15, 19
    When the Infinity AI plays "ignis"'s turn
    And the Infinity AI plays "ignis"'s turn
    And the Infinity AI plays "ignis"'s turn
    Then "ignis" has 3 death save successes and 0 failures
    And the event log shows "Human Wizard is stable"

  Scenario: Taking damage while dying is a failed death save, two on a critical hit
    Given "ignis" is at 0 HP
    And the next d20 rolls are 12, 14
    And the next d10 rolls are 1, 1
    When "malakor" attacks "ignis"
    Then the attack is a critical hit
    And "ignis" has 0 death save successes and 2 failures

  Scenario: Healing a dying character brings them back up
    Given "ignis" is at 0 HP
    And the next d8 roll is 5
    When "thrumbar" casts "cure-wounds" at "ignis"
    Then "ignis" has 7 HP
    And "ignis" is not unconscious
    And "ignis" has 0 death save successes and 0 failures

  Scenario: Healing never goes past max HP
    Given "vance" is at 11 HP
    And the next d4 roll is 4
    When "thrumbar" casts "healing-word" at "vance"
    Then "vance" has full HP
    And the engine audit is clean
