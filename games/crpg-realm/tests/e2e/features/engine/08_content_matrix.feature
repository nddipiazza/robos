@engine
Feature: Content matrix: every class, race, monster and condition
  Anything in data/v1 can appear in a dropped-in scenario, so every class, race,
  monster and condition is built, put in a fight and checked here.

  Scenario Outline: A level-1 human <class> gets its hit die, kit and AC, then fights
    Given a cRPG test scenario "Class <class>" with seed 81
    And the party
      | id   | class   | race  | level | x | y |
      | hero | <class> | human | 1     | 0 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 20 | 0 |
    Then "hero" has <hp> max HP and AC <ac>
    When the Infinity AI plays up to 3 rounds
    Then the engine audit is clean

    Examples:
      | class     | hp | ac |
      | barbarian | 14 | 14 |
      | bard      | 10 | 13 |
      | cleric    | 10 | 18 |
      | druid     | 10 | 16 |
      | fighter   | 12 | 18 |
      | monk      | 10 | 15 |
      | paladin   | 12 | 18 |
      | ranger    | 12 | 15 |
      | rogue     | 10 | 14 |
      | sorcerer  | 8  | 12 |
      | warlock   | 10 | 13 |
      | wizard    | 8  | 12 |

  Scenario Outline: A level-5 <class> gets extra attacks or higher-level slots
    Given a cRPG test scenario "Level 5 <class>" with seed 82
    And the party
      | id   | class   | race  | level | x | y |
      | hero | <class> | human | 5     | 0 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 20 | 0 |
    Then "hero" has <hp> max HP and AC <ac>
    And "hero" has <slots> level-3 spell slots left
    When the Infinity AI plays up to 3 rounds
    Then the engine audit is clean

    Examples:
      | class     | hp | ac | slots |
      | barbarian | 50 | 14 | 0     |
      | fighter   | 44 | 18 | 0     |
      | wizard    | 32 | 12 | 2     |
      | cleric    | 38 | 18 | 2     |
      | paladin   | 44 | 18 | 0     |
      | warlock   | 38 | 13 | 2     |

  Scenario Outline: A <race> fighter gets the race's ability bonuses and speed
    Given a cRPG test scenario "Race <race>" with seed 83
    And the party
      | id   | class   | race   | level | x | y |
      | hero | fighter | <race> | 1     | 0 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 20 | 0 |
    Then "hero" has <hp> max HP and AC 18
    And "hero" has speed <speed>
    When the Infinity AI plays up to 3 rounds
    Then the engine audit is clean

    Examples:
      | race       | hp | speed |
      | human      | 12 | 30    |
      | elf        | 12 | 30    |
      | dwarf      | 13 | 25    |
      | halfling   | 12 | 25    |
      | dragonborn | 12 | 30    |
      | gnome      | 12 | 25    |
      | half-elf   | 12 | 30    |
      | half-orc   | 12 | 30    |
      | tiefling   | 12 | 30    |

  Scenario Outline: The <monster> fights a level-5 party to a finish under the Infinity AI
    Given a cRPG test scenario "Monster <monster>" with seed 84
    And the round limit is 12
    And the party
      | id       | class   | race  | level | x | y  |
      | vance    | fighter | human | 5     | 0 | 0  |
      | thrumbar | cleric  | dwarf | 5     | 0 | 10 |
    And the enemies
      | id  | monster   | count | x  | y |
      | foe | <monster> | 2     | 40 | 0 |
    When the Infinity AI plays the battle to the end
    Then the battle has ended
    And the engine audit is clean

    Examples:
      | monster              |
      | corrupted-hound      |
      | corrupted-guard      |
      | captain-malakor-boss |
      | skeleton             |
      | zombie               |
      | ancient-stone-golem  |

  Scenario Outline: The <condition> condition on the <who>: it <effect>
    Given a cRPG test scenario "Condition <condition>" with seed 85
    And the party
      | id    | class   | race  | level | x | y |
      | vance | fighter | human | 3     | 0 | 0 |
    And the enemies
      | id     | monster         | x  | y  |
      | guard  | corrupted-guard | 5  | 0  |
      | sentry | corrupted-guard | 60 | 60 |
    Then applying "<condition>" to the <who> means it <effect>
    And the engine audit is clean

    Examples:
      | condition        | who      | effect                          |
      | blinded          | attacker | attacks with disadvantage       |
      | poisoned         | attacker | attacks with disadvantage       |
      | frightened       | attacker | attacks with disadvantage       |
      | restrained       | attacker | attacks with disadvantage       |
      | prone            | attacker | attacks with disadvantage       |
      | invisible        | attacker | attacks with advantage          |
      | blinded          | target   | is attacked with advantage      |
      | restrained       | target   | is attacked with advantage      |
      | stunned          | target   | is attacked with advantage      |
      | paralyzed        | attacker | cannot act                      |
      | stunned          | attacker | cannot act                      |
      | unconscious      | attacker | cannot act                      |
      | incapacitated    | attacker | cannot act                      |
      | petrified        | attacker | cannot act                      |
      | grappled         | attacker | cannot move                     |
      | charmed          | attacker | cannot attack its charmer       |
      | deafened         | attacker | still acts normally             |
      | exhaustion       | attacker | still acts normally             |
      | sanctuary        | target   | forces a WIS save to attack it  |
      | see_invisibility | attacker | sees invisible creatures        |
