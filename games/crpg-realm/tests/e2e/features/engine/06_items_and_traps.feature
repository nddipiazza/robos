@engine
Feature: Items, accessories and traps
  Consumables resolve from their "use" block in items.json, accessories grant
  conditions or AC, and traps are spotted, searched for, disarmed or triggered.

  Scenario Outline: Drinking a <item> <result>
    Given a cRPG test scenario "Potions" with seed 61
    And the party
      | id    | class   | race  | level | x | y | inventory |
      | vance | fighter | human | 3     | 0 | 0 | <item>    |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 60 | 0 |
    And "vance" is at 5 HP
    And "vance" is poisoned for 5 rounds
    And the next d4 rolls are 1, 1, 1, 1
    When "vance" uses "<item>"
    Then <check>
    And "vance" has 0 "<item>" left

    Examples:
      | item                   | result                         | check                    |
      | potion-healing         | heals 2d4+2                    | "vance" has 9 HP         |
      | potion-greater-healing | heals 4d4+4                    | "vance" has 13 HP        |
      | potion-speed           | hastes the drinker             | "vance" is hasted        |
      | potion-invisibility    | turns the drinker invisible    | "vance" is invisible     |
      | antidote               | cures poison                   | "vance" is not poisoned  |

  Scenario: A potion can be given to an adjacent ally but not to one across the room
    Given a cRPG test scenario "Potion handoff" with seed 62
    And the party
      | id       | class   | race  | level | x  | y | inventory                      |
      | vance    | fighter | human | 3     | 0  | 0 | potion-healing, potion-healing |
      | thrumbar | cleric  | dwarf | 3     | 5  | 0 |                                |
      | elora    | rogue   | human | 3     | 40 | 0 |                                |
    And the enemies
      | id    | monster         | x  | y  |
      | guard | corrupted-guard | 60 | 60 |
    And "thrumbar" is at 4 HP
    When "vance" uses "potion-healing" on "thrumbar"
    Then "thrumbar" has at least 8 HP
    When "vance" uses "potion-healing" on "elora"
    Then the action is refused because "out_of_reach"
    When "elora" uses "potion-healing"
    Then the action is refused because "not_carried"

  Scenario Outline: The <accessory> works while worn
    Given a cRPG test scenario "Accessories" with seed 63
    And the party
      | id    | class   | race  | level | x | y | accessories   | shield |
      | vance | fighter | human | 1     | 0 | 0 | <accessory>   | false  |
    And the enemies
      | id    | monster         | x | y |
      | guard | corrupted-guard | 5 | 0 |
    Then <check>

    Examples:
      | accessory         | check                            |
      | gem-of-seeing     | "vance" is see_invisibility      |
      | helm-of-truesight | "vance" is see_invisibility      |
      | malakor-signet    | "vance" has AC 17                |

  Scenario: Seeing invisible creatures removes the penalty for attacking them
    Given a cRPG test scenario "Truesight" with seed 64
    And the party
      | id    | class   | race  | level | x | y | accessories   |
      | vance | fighter | human | 1     | 0 | 0 | gem-of-seeing |
    And the enemies
      | id    | monster         | x | y |
      | guard | corrupted-guard | 5 | 0 |
    And "guard" is invisible for 10 rounds
    And the next d20 roll is 15
    When "vance" attacks "guard"
    Then the attack hits
    And the engine audit is clean

  Scenario Outline: Every weapon attacks with its own damage dice and type: <weapon>
    Given a cRPG test scenario "Weapons" with seed 65
    And the party
      | id    | class   | race  | level | x | y | weapon   |
      | vance | fighter | human | 1     | 0 | 0 | <weapon> |
    And the enemies
      | id    | monster         | x   | y |
      | guard | corrupted-guard | <x> | 0 |
      | spare | corrupted-guard | 90  | 90 |
    And the next d20 roll is 15
    And the next d<die> rolls are 1, 1
    When "vance" attacks "guard"
    Then the attack hits
    And "guard" took <damage> <type> damage

    Examples:
      | weapon         | x  | die | damage | type        |
      | service-sword  | 5  | 8   | 4      | slashing    |
      | dagger         | 5  | 4   | 4      | piercing    |
      | shortsword     | 5  | 6   | 4      | piercing    |
      | longsword      | 5  | 8   | 4      | slashing    |
      | greatsword     | 5  | 6   | 5      | slashing    |
      | mace           | 5  | 6   | 4      | bludgeoning |
      | warhammer      | 5  | 8   | 4      | bludgeoning |
      | morningstar    | 5  | 8   | 4      | piercing    |
      | rapier         | 5  | 8   | 4      | piercing    |
      | quarterstaff   | 5  | 6   | 4      | bludgeoning |
      | spear          | 5  | 6   | 4      | piercing    |
      | hunting-bow    | 40 | 8   | 3      | piercing    |
      | shortbow       | 40 | 6   | 3      | piercing    |
      | longbow        | 40 | 8   | 3      | piercing    |
      | light-crossbow | 40 | 8   | 3      | piercing    |
      | heavy-crossbow | 40 | 10  | 3      | piercing    |

  Scenario Outline: Every armor sets AC by its type: <armor>
    Given a cRPG test scenario "Armor" with seed 66
    And the party
      | id    | class   | race  | level | x | y | armor   | shield |
      | vance | fighter | human | 1     | 0 | 0 | <armor> | false  |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 60 | 0 |
    Then "vance" has AC <ac>

    Examples:
      | armor           | ac |
      | padded          | 13 |
      | leather-armor   | 13 |
      | studded-leather | 14 |
      | hide-armor      | 14 |
      | chain-shirt     | 15 |
      | scale-mail      | 16 |
      | breastplate     | 16 |
      | half-plate      | 17 |
      | ring-mail       | 14 |
      | chain-mail      | 16 |
      | splint-armor    | 17 |
      | plate-armor     | 18 |

  Scenario: A shield adds 2 AC
    Given a cRPG test scenario "Shield" with seed 67
    And the party
      | id    | class   | race  | level | x | y | armor      | shield |
      | vance | fighter | human | 1     | 0 | 0 | chain-mail | true   |
    And the enemies
      | id    | monster         | x  | y |
      | guard | corrupted-guard | 60 | 0 |
    Then "vance" has AC 18

  Rule: Traps
    Background:
      Given a cRPG test scenario "Trapped corridor" with seed 68
      And the party
        | id       | class   | race     | level | x | y  | inventory     |
        | vance    | fighter | human    | 1     | 0 | 0  |               |
        | elora    | rogue   | half-elf | 3     | 0 | 10 | thieves-tools |
        | thrumbar | cleric  | dwarf    | 3     | 0 | 20 |               |
      And the enemies
        | id     | monster | x   | y  |
        | zombie | zombie  | 150 | 80 |
      And the traps
        | id   | trap             | x  | y  |
        | dart | poison-dart-trap | 30 | 0  |
        | pit  | spike-pit-trap   | 30 | 40 |

    Scenario: Walking onto a hidden trap triggers it: a save, damage and a condition
      Given the next d20 roll is 5
      And the next d6 rolls are 3, 3
      When "vance" moves to 30,0
      Then "vance" took 6 poison damage
      And "vance" is poisoned
      And the event log shows "triggers Concealed Poison Dart Trap"

    Scenario: A rogue's passive perception spots a trap when she comes within 10 feet
      When "elora" moves to 22,10
      Then the event log shows "spots dart (passive 14)"
      When "elora" moves to 30,0
      Then "elora" took no damage

    Scenario: Searching finds a trap nearby
      Given "vance" is standing at 20,0
      And the next d20 roll is 15
      When "vance" searches for traps
      Then the event log shows "found dart"

    Scenario: A rogue with thieves' tools disarms a detected trap, and it stays harmless
      Given "elora" is standing at 25,5
      And the next d20 roll is 15
      When "elora" searches for traps
      Given the next d20 roll is 10
      When "elora" disarms "dart"
      Then the event log shows "disarmed"
      When "vance" moves to 30,0
      Then "vance" took no damage

    Scenario: Failing a disarm by 5 or more sets the trap off
      Given "elora" is standing at 25,5
      And the next d20 roll is 15
      When "elora" searches for traps
      Given the next d20 rolls are 2, 20
      And the next d6 rolls are 2, 2
      When "elora" disarms "dart"
      Then the event log shows "triggers Concealed Poison Dart Trap"
      And "elora" took 2 poison damage
      And "elora" is not poisoned

    Scenario: A trap that hasn't been found can't be disarmed
      Given "elora" is standing at 25,5
      When "elora" disarms "dart"
      Then the action is refused because "trap_not_detected"

    Scenario: Find Traps reveals every trap within range
      When "thrumbar" casts "find-traps"
      Then the event log shows "senses dart"
      And the event log shows "senses pit"
