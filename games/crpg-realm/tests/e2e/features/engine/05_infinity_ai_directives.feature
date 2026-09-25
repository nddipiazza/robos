@engine
Feature: Infinity AI directives steer player characters and NPCs
  The Infinity AI plays any combatant: party members, enemies and NPC allies.
  Its choices come out as player inputs (the same commands a person would click),
  and robos:InfinityAIDirective nodes steer them: heal thresholds, target
  priority, focus targets, allowed spells, movement style, or fully scripted input.

  Background:
    Given a cRPG test scenario "Directives" with seed 51

  Scenario: A cleric heals an ally who drops below the heal threshold
    Given the party
      | id       | class   | race  | level | x | y |
      | thrumbar | cleric  | dwarf | 3     | 0 | 0 |
      | vance    | fighter | human | 3     | 5 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 60 | 0 |
    And "vance" is at 8 HP
    When the Infinity AI plays "thrumbar"'s turn
    Then the Infinity AI made "thrumbar" cast "healing-word"
    And "vance" has at least 9 HP

  Scenario: A lower heal threshold keeps the cleric from healing a lightly wounded ally
    Given the party
      | id       | class   | race  | level | x | y |
      | thrumbar | cleric  | dwarf | 3     | 0 | 0 |
      | vance    | fighter | human | 3     | 5 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 60 | 0 |
    And the Infinity AI directives
      | actor    | controller  | healThreshold |
      | thrumbar | infinity_ai | 0.2           |
    And "vance" is at 8 HP
    When the Infinity AI plays "thrumbar"'s turn
    Then the Infinity AI never made "thrumbar" cast "healing-word"
    And the Infinity AI never made "thrumbar" cast "cure-wounds"

  Scenario: A focus target overrides "nearest"
    Given the party
      | id    | class   | race  | level | x | y |
      | vance | fighter | human | 3     | 0 | 0 |
    And the enemies
      | id    | monster         | x  | y  |
      | guard | corrupted-guard | 10 | 0  |
      | boss  | corrupted-guard | 10 | 25 |
    And the Infinity AI directives
      | actor | controller  | focusTarget |
      | vance | infinity_ai | boss        |
    When the Infinity AI plays "vance"'s turn
    Then the Infinity AI made "vance" target "boss"

  Scenario: Target priority "lowest_hp" picks the most wounded foe in reach
    Given the party
      | id    | class   | race  | level | x | y |
      | vance | fighter | human | 3     | 5 | 5 |
    And the enemies
      | id      | monster         | x  | y  |
      | guard_a | corrupted-guard | 10 | 5  |
      | guard_b | corrupted-guard | 5  | 10 |
    And the Infinity AI directives
      | side  | controller  | targetPriority |
      | party | infinity_ai | lowest_hp      |
    And "guard_b" is at 3 HP
    When the Infinity AI plays "vance"'s turn
    Then the Infinity AI made "vance" attack "guard_b"

  Scenario: The wizard opens with Fireball when three foes are bunched together
    Given the party
      | id    | class  | race | level | x | y |
      | ignis | wizard | elf  | 5     | 0 | 0 |
    And the enemies
      | id       | monster  | count | x  | y |
      | skeleton | skeleton | 3     | 60 | 0 |
    When the Infinity AI plays "ignis"'s turn
    Then the Infinity AI made "ignis" cast "fireball"

  Scenario: The Infinity AI doesn't waste Sleep on undead, which are immune to it
    Given the party
      | id    | class  | race | level | x | y |
      | ignis | wizard | elf  | 1     | 0 | 0 |
    And the enemies
      | id       | monster  | count | x  | y |
      | skeleton | skeleton | 3     | 60 | 0 |
    When the Infinity AI plays "ignis"'s turn
    Then the Infinity AI never made "ignis" cast "sleep"
    And the Infinity AI made "ignis" cast "magic-missile"

  Scenario: A forbidden spell is never cast
    Given the party
      | id    | class  | race | level | x | y |
      | ignis | wizard | elf  | 5     | 0 | 0 |
    And the enemies
      | id       | monster  | count | x  | y |
      | skeleton | skeleton | 3     | 60 | 0 |
    And the Infinity AI directives
      | actor | controller  | forbidSpells             |
      | ignis | infinity_ai | fireball, lightning-bolt |
    When the Infinity AI plays the battle to the end
    Then the Infinity AI never made "ignis" cast "fireball"
    And the Infinity AI never made "ignis" cast "lightning-bolt"
    And the engine audit is clean

  Scenario: The Infinity AI won't catch an ally in an area spell unless friendly fire is allowed
    Given the party
      | id    | class   | race  | level | x  | y |
      | ignis | wizard  | elf   | 5     | 0  | 0 |
      | vance | fighter | human | 5     | 70 | 10 |
    And the enemies
      | id       | monster  | count | x  | y |
      | skeleton | skeleton | 3     | 60 | 0 |
    When the Infinity AI plays "ignis"'s turn
    Then the Infinity AI never made "ignis" cast "fireball"

  Scenario: With friendly fire allowed, the wizard fireballs through an ally
    Given the party
      | id    | class   | race  | level | x  | y |
      | ignis | wizard  | elf   | 5     | 0  | 0 |
      | vance | fighter | human | 5     | 70 | 10 |
    And the enemies
      | id       | monster  | count | x  | y |
      | skeleton | skeleton | 3     | 60 | 0 |
    And the Infinity AI directives
      | actor | controller  | allowFriendlyFire |
      | ignis | infinity_ai | true              |
    When the Infinity AI plays "ignis"'s turn
    Then the Infinity AI made "ignis" cast "fireball"

  Scenario: A weapons-only directive keeps a wizard from casting
    Given the party
      | id    | class  | race | level | x | y |
      | ignis | wizard | elf  | 5     | 0 | 0 |
    And the enemies
      | id    | monster         | x | y |
      | guard | corrupted-guard | 5 | 0 |
    And the Infinity AI directives
      | actor | controller  | useSpells |
      | ignis | infinity_ai | false     |
    When the Infinity AI plays "ignis"'s turn
    Then the Infinity AI made "ignis" attack "guard"

  Scenario: "hold" movement keeps a fighter in place and it dodges instead
    Given the party
      | id    | class   | race  | level | x | y |
      | vance | fighter | human | 3     | 0 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 40 | 0 |
    And the Infinity AI directives
      | actor | controller  | movement |
      | vance | infinity_ai | hold     |
    When the Infinity AI plays "vance"'s turn
    Then the Infinity AI made "vance" dodge
    And "vance" is at 0,0

  Scenario: A ranger with "kite" shoots and then backs away
    Given the party
      | id   | class  | race  | level | x | y |
      | tarn | ranger | human | 3     | 0 | 0 |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 30 | 0 |
    And the Infinity AI directives
      | actor | controller  | movement |
      | tarn  | infinity_ai | kite     |
    When the Infinity AI plays "tarn"'s turn
    Then the Infinity AI made "tarn" attack "guard"
    And the event log shows "kite away"

  Scenario: A badly hurt fighter drinks a healing potion
    Given the party
      | id    | class   | race  | level | x | y | inventory      |
      | vance | fighter | human | 3     | 0 | 0 | potion-healing |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 40 | 0 |
    And "vance" is at 5 HP
    When the Infinity AI plays "vance"'s turn
    Then the Infinity AI made "vance" use "potion-healing"
    And "vance" has at least 9 HP
    And "vance" has 0 "potion-healing" left

  Scenario: Scripted player inputs are played exactly, overriding the AI's own choice
    Given the party
      | id    | class   | race  | level | x | y |
      | vance | fighter | human | 3     | 5 | 5 |
    And the enemies
      | id      | monster         | x  | y  |
      | guard_a | corrupted-guard | 10 | 5  |
      | guard_b | corrupted-guard | 5  | 10 |
    And the scripted player inputs for "vance"
      | round | type   | target  |
      | 1     | attack | guard_b |
      | 2     | dodge  |         |
    When the Infinity AI plays "vance"'s turn
    Then the Infinity AI made "vance" attack "guard_b"
    And every input "vance" gave came from its script

  Scenario: An NPC with the "idle" controller does nothing on its turn
    Given the party
      | id    | class   | race  | level | x | y |
      | vance | fighter | human | 3     | 0 | 0 |
    And the enemies
      | id    | monster         | x | y |
      | guard | corrupted-guard | 5 | 0 |
    And the Infinity AI directives
      | actor | controller |
      | guard | idle       |
    When the Infinity AI plays "guard"'s turn
    Then the Infinity AI made "guard" wait
    And "vance" has full HP

  Scenario: An enemy boss told to hunt spellcasters goes for the wizard
    Given the party
      | id    | class   | race  | level | x  | y  |
      | vance | fighter | human | 5     | 5  | 10 |
      | ignis | wizard  | elf   | 5     | 15 | 10 |
    And the enemies
      | id      | monster              | x  | y  |
      | malakor | captain-malakor-boss | 10 | 10 |
    And the Infinity AI directives
      | actor   | controller  | targetPriority |
      | malakor | infinity_ai | spellcaster    |
    When the Infinity AI plays "malakor"'s turn
    Then the Infinity AI made "malakor" attack "ignis"

  Scenario: An NPC ally is played by the Infinity AI on the party's side
    Given a cRPG test scenario
      """
      {"name": "Gate guard", "seed": 52,
       "party": [{"id": "vance", "class": "fighter", "level": 1, "x": 0, "y": 0}],
       "allies": [{"id": "gate_guard", "monster": "corrupted-guard", "name": "Village Gate Guard", "x": 10, "y": 0}],
       "enemies": [{"id": "hound", "monster": "corrupted-hound", "x": 15, "y": 0}]}
      """
    When the Infinity AI plays "gate_guard"'s turn
    Then the Infinity AI made "gate_guard" attack "hound"

  Scenario: The Infinity AI plays both sides of a whole battle under their directives
    Given the party
      | id       | class   | race     | level | x  | y  | inventory      |
      | vance    | fighter | human    | 3     | 10 | 10 | potion-healing |
      | thrumbar | cleric  | dwarf    | 3     | 0  | 20 |                |
      | elora    | rogue   | half-elf | 3     | 10 | 30 |                |
    And the enemies
      | id    | monster         | count | x  | y  |
      | guard | corrupted-guard | 3     | 60 | 10 |
    And the Infinity AI directives
      | side  | controller  | targetPriority |
      | party | infinity_ai | lowest_hp      |
      | enemy | infinity_ai | nearest        |
    When the Infinity AI plays the battle to the end
    Then the outcome is "victory"
    And the engine audit is clean
    And replaying the scenario produces the identical battle
