@engine
Feature: Spells, saving throws and spell reactions
  Every spell resolves from its mechanics in spells.json: attack rolls, saving
  throws against the caster's spell DC, areas, conditions, and reactions such as
  Shield and Counterspell. Ignis is a level-5 wizard (spell DC 14), Thrumbar a
  level-5 cleric (spell DC 13, spell attack +5).

  Background:
    Given a cRPG test scenario
      """
      {"name": "Spellbook", "seed": 31,
       "party": [
         {"id": "ignis",    "name": "Ignis",    "class": "wizard",  "race": "human",    "level": 5, "x": 0, "y": 0},
         {"id": "thrumbar", "name": "Thrumbar", "class": "cleric",  "race": "dwarf",    "level": 5, "x": 0, "y": 10},
         {"id": "vance",    "name": "Vance",    "class": "fighter", "race": "human",    "level": 5, "x": 0, "y": 20},
         {"id": "elora",    "name": "Elora",    "class": "rogue",   "race": "half-elf", "level": 3, "x": 0, "y": 30}
       ],
       "enemies": [
         {"id": "skeleton", "monster": "skeleton", "count": 3, "x": 80, "y": 0},
         {"id": "guard", "monster": "corrupted-guard", "x": 40, "y": 20},
         {"id": "hound", "monster": "corrupted-hound", "count": 2, "x": 20, "y": 60},
         {"id": "cultist", "name": "Void Cultist", "x": 150, "y": 100, "hp": 20, "ac": 12,
          "abilities": {"STR": 10, "DEX": 12, "CON": 12, "INT": 16, "WIS": 12, "CHA": 10},
          "attacks": [{"name": "Dagger", "attackBonus": 4, "damage": "1d4+2", "damageType": "piercing", "range": 5}],
          "spells": ["magic-missile", "counterspell"], "slots": {"1": 2, "3": 1}}
       ]}
      """

  Scenario: Magic Missile never misses and deals the sum of its darts
    Given the next d4 rolls are 1, 2, 3
    When "ignis" casts "magic-missile" at "guard"
    Then "guard" took 9 force damage
    And "guard" has 7 HP
    And "ignis" has 3 level-1 spell slots left
    And the engine audit is clean

  Scenario: A wizard hit by Magic Missile reacts with Shield and takes nothing
    Given "cultist" is standing at 60,0
    And "ignis" has 0 level-3 spell slots
    When "cultist" casts "magic-missile" at "ignis"
    Then "ignis" took no damage
    And "ignis" is shielded
    And "ignis" has 3 level-1 spell slots left
    And the event log shows "Ignis reacts with Shield"

  Scenario: Shield lasts until the start of the wizard's next turn
    Given "cultist" is standing at 60,0
    And "ignis" has 0 level-3 spell slots
    When "cultist" casts "magic-missile" at "ignis"
    And the Infinity AI plays "ignis"'s turn
    Then "ignis" is not shielded

  Scenario: An enemy caster in range counters a spell with Counterspell
    Given "cultist" is standing at 50,0
    When "ignis" casts "magic-missile" at "cultist"
    Then the action is refused because "countered"
    And "ignis" has 3 level-1 spell slots left
    And "cultist" has 0 level-3 spell slots left
    And "cultist" took no damage

  Scenario: Fireball: one damage roll, a DEX save each, half damage on a success
    Given the next d6 rolls are 3, 3, 3, 3, 3, 3, 3, 3
    And the next d20 rolls are 15, 2, 2
    When "ignis" casts "fireball" at point 90,0
    Then "skeleton_1" has 1 HP
    And "skeleton_2" is dead
    And "skeleton_3" is dead
    And "guard" was not affected
    And "ignis" has 1 level-3 spell slots left
    And the engine audit is clean

  Scenario: A paralyzed creature automatically fails a DEX save
    Given "skeleton_1" is paralyzed for 3 rounds
    And the next d6 rolls are 1, 1, 1, 1, 1, 1, 1, 1
    And the next d20 rolls are 20, 20
    When "ignis" casts "fireball" at point 90,0
    Then "skeleton_1" has 5 HP
    And "skeleton_2" has 9 HP
    And the event log shows "DEX save vs DC 14: auto-fail"

  Scenario: Lightning Bolt hits everything along a 100-foot line
    Given the next d6 rolls are 1, 1, 1, 1, 1, 1, 1, 1
    And the next d20 rolls are 20, 20, 20
    When "ignis" casts "lightning-bolt" at point 100,0
    Then "skeleton_1" has 9 HP
    And "skeleton_3" has 9 HP
    And "guard" was not affected

  Scenario: Burning Hands fills a 15-foot cone and spares creatures beside the caster
    Given "guard" is standing at 10,0
    And the next d6 rolls are 3, 3, 3
    And the next d20 roll is 1
    When "ignis" casts "burning-hands" at point 15,0
    Then "guard" took 9 fire damage
    And "thrumbar" was not affected

  Scenario: Thunderwave hits friend and foe around the caster and pushes the ones who fail
    Given "guard" is standing at 5,0
    And the next d8 rolls are 4, 4
    And the next d20 rolls are 20, 1
    When "ignis" casts "thunderwave"
    Then "thrumbar" took 4 thunder damage
    And "guard" took 8 thunder damage
    And "guard" is at 15,0

  Scenario: Blizzard knocks prone the creatures that fail their save
    Given the next d6 rolls are 1, 1, 1, 1, 1, 1
    And the next d20 rolls are 1, 20, 20
    When "ignis" casts "blizzard" at point 90,0
    Then "skeleton_1" is prone
    And "skeleton_1" has 7 HP
    And "skeleton_2" is not prone
    And "skeleton_2" has 10 HP

  Scenario: Stinking Cloud poisons the creatures that fail a CON save
    Given the next d20 rolls are 1, 20
    And the next d6 rolls are 1, 1, 1, 1
    When "ignis" casts "stinking-cloud" at point 25,60
    Then "hound_1" is poisoned
    And "hound_1" has 7 HP
    And "hound_2" is not poisoned
    And "hound_2" has full HP

  Scenario: Sleep puts the lowest-HP creatures to sleep until its pool of HP runs out
    Given the next d8 rolls are 3, 3, 3, 3, 3
    When "ignis" casts "sleep" at point 25,60
    Then "hound_1" is unconscious
    And "hound_2" is not unconscious

  Scenario: Damage wakes a creature put to sleep by the Sleep spell
    Given the next d8 rolls are 3, 3, 3, 3, 3
    When "ignis" casts "sleep" at point 25,60
    Given "vance" is standing at 15,60
    And the next d20 rolls are 10, 12, 1
    And the next d8 rolls are 1, 1
    When "vance" attacks "hound_1"
    Then the event log shows "attacks Corrupted Shadow Hound 1 with Longsword: CRITICAL HIT"
    And the event log shows "is no longer unconscious (took damage)"
    And "hound_1" is not unconscious
    And "hound_1" has 6 HP

  Scenario: Hold Person paralyzes a humanoid that fails its WIS save, until it saves
    Given the next d20 roll is 5
    When "thrumbar" casts "hold-person" at "guard"
    Then "guard" is paralyzed
    Given the next d20 roll is 15
    When the Infinity AI plays "guard"'s turn
    Then "guard" is not paralyzed
    And the event log shows "saved at end of turn"

  Scenario: Hold Person has no effect on a creature that isn't humanoid, but the slot is spent
    Given "thrumbar" is standing at 60,10
    When "thrumbar" casts "hold-person" at "skeleton_1"
    Then "skeleton_1" is not paralyzed
    And the event log shows "has no effect on Skeleton Warrior 1"
    And "thrumbar" has 2 level-2 spell slots left

  Scenario: Sanctuary turns an attacker away when it fails a WIS save
    Given "guard" is standing at 5,0
    When "thrumbar" casts "sanctuary" at "ignis"
    Given the next d20 roll is 3
    When "guard" attacks "ignis"
    Then the action is refused because "sanctuary"
    And "ignis" took no damage

  Scenario: Invisibility gives advantage on attacks and ends when the invisible creature attacks
    Given "elora" is standing at 5,0
    When "ignis" casts "invisibility" at "elora"
    Then "elora" is invisible
    Given "guard" is standing at 10,0
    And the next d20 rolls are 3, 17
    When "elora" attacks "guard"
    Then the attack was rolled with advantage
    And "elora" is not invisible

  Scenario: A spell can't target an unseen creature until the caster can see invisible things
    Given "guard" is invisible for 10 rounds
    When "ignis" casts "magic-missile" at "guard"
    Then the action is refused because "target_unseen"
    When "ignis" casts "see-invisibility"
    And "ignis" casts "magic-missile" at "guard"
    Then the action succeeds

  Scenario: Bless, Haste and Mage Armor change the numbers they should
    When "thrumbar" casts "bless"
    Then "vance" is blessed
    And "thrumbar" has 3 level-1 spell slots left
    When "ignis" casts "haste" at "vance"
    Then "vance" has AC 20
    When "ignis" casts "mage-armor" at "ignis"
    Then "ignis" has AC 15

  Scenario: Dispel Magic strips magical effects from everyone in the burst
    When "ignis" casts "haste" at "vance"
    And "thrumbar" casts "dispel-magic" at point 0,20
    Then "vance" is not hasted
    And "vance" has AC 18

  Scenario: Spiritual Weapon makes a melee spell attack using the cleric's WIS
    Given the next d20 roll is 15
    And the next d8 roll is 4
    When "thrumbar" casts "spiritual-weapon" at "guard"
    Then the attack hits
    And "guard" took 6 force damage

  Scenario: Fighter maneuvers spend a maneuver and hit hard
    Given "vance" is standing at 35,20
    And the next d8 rolls are 1, 1
    When "vance" casts "tremor-stomp" at "guard"
    Then "guard" has 10 HP
    And "guard" is prone
    Given the next d10 rolls are 1, 1
    When "vance" casts "crushing-cleave" at "guard"
    Then "guard" has 2 HP
    Given "vance" is at 10 HP
    And the next d6 rolls are 1, 1
    When "vance" casts "rallying-stomp"
    Then "vance" has 16 HP
    And "vance" is rallied
    And "vance" has 0 maneuvers left

  Scenario: Knock is a utility spell that resolves without touching anyone
    When "ignis" casts "knock" at point 20,0
    Then the action succeeds
    And "guard" was not affected

  Scenario Outline: Casting is refused when <why>
    Given "<caster>" is standing at <x>,<y>
    And <setup>
    When "<caster>" casts "<spell>" at "<target>"
    Then the action is refused because "<reason>"

    Examples:
      | why                                  | caster   | x | y  | setup                                   | spell         | target  | reason          |
      | the caster has no slots left         | ignis    | 0 | 0  | "ignis" has no spell slots left         | magic-missile | guard   | no_slot         |
      | the caster doesn't know the spell    | vance    | 0 | 20 | "vance" is at 44 HP                     | fireball      | guard   | spell_not_known |
      | the target is beyond the spell range | ignis    | 0 | 0  | "ignis" is at 30 HP                     | magic-missile | cultist | out_of_range    |
      | a touch spell's target is too far    | thrumbar | 0 | 10 | "thrumbar" is at 30 HP                  | cure-wounds   | elora   | out_of_range    |
      | a reaction spell is cast on purpose  | ignis    | 0 | 0  | "ignis" is at 30 HP                     | counterspell  | guard   | reaction_only   |
