@engine
Feature: Movement, opportunity attacks and the battle map
  Creatures move up to their speed, provoke opportunity attacks when they leave
  a foe's reach (unless they disengage), can't end a move in an occupied square,
  and stay inside the battle map.

  Background:
    Given a cRPG test scenario
      """
      {"name": "Movement", "seed": 71, "map": {"width": 50, "height": 50},
       "party": [
         {"id": "vance",    "class": "fighter", "race": "human", "level": 3, "x": 0,  "y": 0},
         {"id": "thrumbar", "class": "cleric",  "race": "dwarf", "level": 3, "x": 10, "y": 20}
       ],
       "enemies": [
         {"id": "guard", "monster": "corrupted-guard", "x": 5, "y": 0},
         {"id": "far",   "monster": "corrupted-guard", "x": 50, "y": 50}
       ]}
      """

  Scenario: A creature moves no farther than its speed
    Given "vance" is standing at 0,40
    When "vance" moves to 50,40
    Then "vance" is at 30,40

  Scenario: A dwarf's speed is 25 feet
    Given "thrumbar" is standing at 10,40
    When "thrumbar" moves to 50,40
    Then "thrumbar" is at 35,40

  Scenario: Leaving a foe's reach provokes an opportunity attack
    Given the next d20 roll is 15
    And the next d6 roll is 4
    When "vance" moves to 0,25
    Then the event log shows "makes an opportunity attack on"
    And "vance" took 6 piercing damage

  Scenario: Disengaging first means no opportunity attack
    When "vance" disengages and moves to 0,25
    Then "vance" took no damage
    And "vance" is at 0,25

  Scenario: Standing up from prone costs half the creature's speed
    Given "vance" is prone for 10 rounds
    And "vance" is standing at 0,40
    When "vance" moves to 50,40
    Then "vance" is not prone
    And "vance" is at 15,40

  Scenario: A restrained or grappled creature can't move
    Given "vance" is restrained for 3 rounds
    When "vance" moves to 0,25
    Then the action is refused because "speed_zero_restrained"
    Given "thrumbar" is grappled for 3 rounds
    When "thrumbar" moves to 10,40
    Then the action is refused because "speed_zero_grappled"

  Scenario: A creature can't end its move in another creature's square
    When "thrumbar" moves to 5,0
    Then "thrumbar" and "guard" are in different squares
    And the engine audit is clean

  Scenario: Movement stops at the edge of the battle map
    Given "vance" is standing at 40,40
    When "vance" moves to 70,40
    Then "vance" is at 50,40

  Scenario: The Infinity AI walks two fighters to different free squares around one foe
    Given a cRPG test scenario
      """
      {"name": "Surround", "seed": 72,
       "party": [
         {"id": "a", "class": "fighter", "level": 1, "x": 0, "y": 0},
         {"id": "b", "class": "fighter", "level": 1, "x": 0, "y": 10}
       ],
       "enemies": [{"id": "guard", "monster": "corrupted-guard", "x": 30, "y": 5, "hp": 60}],
       "directives": [{"side": "enemy", "controller": "idle"}]}
      """
    When the Infinity AI plays "a"'s turn
    And the Infinity AI plays "b"'s turn
    Then the Infinity AI made "a" target "guard"
    And the Infinity AI made "b" target "guard"
    And "a" and "b" are in different squares
    And the engine audit is clean
