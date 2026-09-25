@engine
Feature: Rule edge cases
  The rarer rule paths: Bless on attacks and saves, Sanctuary being pierced or
  broken, running out of maneuvers, healing the dead, the Disengage action, every
  trap type, and a disarm that fails without setting the trap off.

  Background:
    Given a cRPG test scenario "Edges" with seed 91
    And the party
      | id       | class   | race     | level | x  | y  | inventory     |
      | vance    | fighter | human    | 1     | 0  | 0  |               |
      | thrumbar | cleric  | dwarf    | 3     | 0  | 10 |               |
      | elora    | rogue   | half-elf | 3     | 0  | 20 | thieves-tools |
    And the enemies
      | id     | monster         | x  | y  |
      | guard  | corrupted-guard | 5  | 0  |
      | sentry | corrupted-guard | 60 | 60 |

  Scenario: Bless adds 1d4 to attack rolls
    When "thrumbar" casts "bless"
    Given the next d20 roll is 8
    And the next d4 roll is 1
    When "vance" attacks "guard"
    Then the attack hits
    And the event log shows "(d20 8 + 6 = 14 vs AC 14)"

  Scenario: Bless adds 1d4 to saving throws
    Given a cRPG test scenario
      """
      {"name": "Blessed save", "seed": 94,
       "party": [{"id": "vance", "class": "fighter", "race": "human", "level": 1, "x": 0, "y": 0},
                 {"id": "thrumbar", "class": "cleric", "race": "dwarf", "level": 3, "x": 0, "y": 10}],
       "enemies": [{"id": "zombie", "monster": "zombie", "x": 150, "y": 80}],
       "traps": [{"id": "dart", "trap": "poison-dart-trap", "x": 20, "y": 0}]}
      """
    When "thrumbar" casts "bless"
    Given the next d20 roll is 5
    And the next d4 roll is 3
    When "vance" moves to 20,0
    Then the event log shows "CON save vs DC 13: 5 + 7 = 12 → failure"

  Scenario: An attacker who makes its WIS save strikes through Sanctuary
    When "thrumbar" casts "sanctuary" at "vance"
    Given the next d20 rolls are 18, 15
    When "guard" attacks "vance"
    Then the action succeeds
    And the event log shows "WIS save vs DC 12: 18 + 0 = 18 → success"

  Scenario: Attacking ends the attacker's own Sanctuary
    When "thrumbar" casts "sanctuary" at "vance"
    And "vance" attacks "guard"
    Then "vance" is not sanctuary

  Scenario: A fighter out of maneuvers can't use one
    When "vance" casts "rallying-stomp"
    And "vance" casts "rallying-stomp"
    And "vance" casts "rallying-stomp"
    And "vance" casts "rallying-stomp"
    Then the action is refused because "no_maneuver_left"
    And "vance" has 0 maneuvers left

  Scenario: The dead can't be healed
    Given "vance" is at 0 HP
    And the next d20 rolls are 1, 1
    When the Infinity AI plays "vance"'s turn
    And the Infinity AI plays "vance"'s turn
    Then "vance" is dead
    When "thrumbar" casts "healing-word" at "vance"
    Then the action is refused because "target_dead"
    Given "thrumbar" is standing at 5,5
    And "thrumbar" carries "potion-healing"
    When "thrumbar" uses "potion-healing" on "vance"
    Then the event log shows "is dead and can't be healed"

  Scenario: The Disengage action lets a creature walk away without an opportunity attack
    When "vance" takes the disengage action
    And "vance" moves to 0,40
    Then "vance" took no damage
    And "vance" is at 0,30

  Scenario: A disarm that fails by less than 5 doesn't set the trap off
    Given a cRPG test scenario
      """
      {"name": "Near miss", "seed": 92,
       "party": [{"id": "elora", "class": "rogue", "race": "half-elf", "level": 3, "x": 25, "y": 5, "inventory": ["thieves-tools"]}],
       "enemies": [{"id": "zombie", "monster": "zombie", "x": 150, "y": 80}],
       "traps": [{"id": "dart", "trap": "poison-dart-trap", "x": 30, "y": 0, "detected": true}]}
      """
    And the next d20 roll is 7
    When "elora" disarms "dart"
    Then the event log shows "tries to disarm dart: 12 vs DC 14 → failed"
    And "elora" took no damage

  Scenario Outline: The <trap> goes off with a <save> save for <formula> <type> damage
    Given a cRPG test scenario
      """
      {"name": "<trap>", "seed": 93,
       "party": [{"id": "vance", "class": "fighter", "race": "human", "level": 5, "x": 0, "y": 0}],
       "enemies": [{"id": "zombie", "monster": "zombie", "x": 150, "y": 80}],
       "traps": [{"id": "trap", "trap": "<trap>", "x": 20, "y": 0}]}
      """
    And the next d20 roll is 1
    When "vance" moves to 20,0
    Then the event log shows "<save> save vs DC <dc>"
    And "vance" took at least 1 <type> damage
    And the engine audit is clean

    Examples:
      | trap             | save | dc | formula | type     |
      | poison-dart-trap | CON  | 13 | 2d6     | poison   |
      | glyph-of-warding | DEX  | 14 | 3d8     | fire     |
      | spike-pit-trap   | DEX  | 12 | 2d10    | piercing |
      | acid-spray-trap  | DEX  | 13 | 2d8     | acid     |
