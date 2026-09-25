@engine
Feature: Blockout maps: walls, doors, line of sight, cover and difficult terrain
  Maps are robos:CRPGBattleMap KGraph nodes built by robos-crpg-blockout into a
  background image and a 5-ft collision grid. The engine reads the grid: walls
  block movement and sight, doors open or seal passages, crates and statues give
  cover, rubble costs double movement.

  The "test-wall-room" map (60 x 40 ft) has a wall down x=30 from y=0 to y=25,
  a crate at 10,35 (half cover), a statue at 45,35 (three-quarters cover) and
  rubble at 40-50, 5 (difficult terrain).

  Background:
    Given a cRPG test scenario "Blockout" with seed 111
    And the battle map "test-wall-room"
    And the party
      | id    | class   | race  | level | x  | y  |
      | vance | fighter | human | 1     | 20 | 10 |
      | tarn  | ranger  | human | 1     | 0  | 35 |
      | ignis | wizard  | elf   | 5     | 35 | 40 |
    And the enemies
      | id      | monster         | x  | y  |
      | guard   | corrupted-guard | 50 | 20 |
      | hider   | corrupted-guard | 25 | 15 |
      | exposed | corrupted-guard | 20 | 35 |
      | behind  | corrupted-guard | 55 | 35 |
    And the Infinity AI directives
      | side  | controller |
      | enemy | idle       |

  Scenario: A wall blocks the straight line, so the fighter walks around it
    Given "vance" has speed 60
    When "vance" moves to 40,10
    Then "vance" is at 40,10
    And the last move cost 50 ft
    And the engine audit is clean

  Scenario: Walking around the wall uses up the fighter's 30 feet of speed
    When "vance" moves to 40,10
    Then the last move cost 30 ft
    And the engine audit is clean

  Scenario: Stepping into rubble costs double movement
    Given "vance" is standing at 35,5
    When "vance" moves to 45,5
    Then the last move cost 15 ft

  Scenario: A wall blocks line of sight for weapons and spells
    Given "tarn" is standing at 20,5
    When "tarn" attacks "guard"
    Then the action is refused because "no_line_of_sight"
    Given "ignis" is standing at 20,0
    When "ignis" casts "magic-missile" at "guard"
    Then the action is refused because "no_line_of_sight"

  Scenario: A fireball doesn't reach a creature on the far side of a wall
    Given the next d20 roll is 5
    When "ignis" casts "fireball" at point 35,15
    Then "guard" made a DEX saving throw
    And "hider" was not affected
    And "vance" was not affected
    And the engine audit is clean

  Scenario: A crate between the archer and the target gives half cover (+2 AC)
    Given the next d20 roll is 11
    When "tarn" attacks "exposed"
    Then the attack was against AC 16 with half cover
    And the attack hits

  Scenario: A statue in the way gives three-quarters cover (+5 AC)
    Given the next d20 roll is 11
    When "tarn" attacks "behind"
    Then the attack was against AC 19 with three-quarters cover
    And the attack misses

  Scenario: The Infinity AI walks around the wall to reach its target
    Given the Infinity AI directives
      | actor | controller  | focusTarget |
      | vance | infinity_ai | guard       |
    When the Infinity AI plays "vance"'s turn
    And the Infinity AI plays "vance"'s turn
    Then the Infinity AI made "vance" target "guard"
    And the engine audit is clean

  Scenario: An archer whose target is behind a wall walks around it instead of standing still
    Given the Infinity AI directives
      | actor | controller  | focusTarget |
      | tarn  | infinity_ai | guard       |
    And "tarn" is standing at 20,5
    When the Infinity AI plays "tarn"'s turn
    Then the Infinity AI made "tarn" move
    And the event log shows "close in on Feral Guard Skirmisher"
    And the engine audit is clean

  Scenario: A closed door seals a wall, an open door lets creatures and sight through
    Given a cRPG test scenario "Doors" with seed 112
    And the battle map "test-doors"
    And the party
      | id    | class   | race  | level | x  | y |
      | vance | fighter | human | 1     | 10 | 5 |
      | tarn  | ranger  | human | 1     | 30 | 5 |
    And the enemies
      | id    | monster         | x  | y  |
      | guard | corrupted-guard | 30 | 25 |
      | sentry| corrupted-guard | 10 | 25 |
    When "tarn" attacks "sentry"
    Then the action is refused because "no_line_of_sight"
    When "tarn" attacks "guard"
    Then the action succeeds
    Given "vance" has speed 60
    When "vance" moves to 5,25
    Then the last move passed through 30,15
    And "vance" is at 5,25
    And the engine audit is clean

  Scenario: A creature can't start inside a wall
    Then loading this scenario fails with "vance starts inside a wall or obstacle"
      """
      {"name": "In the wall", "seed": 1, "map": {"@id": "urn:robos:crpg:battle-map:test-wall-room"},
       "party": [{"id": "vance", "class": "fighter", "x": 30, "y": 10}],
       "enemies": [{"id": "guard", "monster": "corrupted-guard", "x": 50, "y": 10}]}
      """

  Scenario: A map that doesn't exist, or has objects but no built grid, is rejected
    Then loading this scenario fails with "not found (expected res://maps/nowhere.jsonld)"
      """
      {"name": "Nowhere", "seed": 1, "map": {"@id": "urn:robos:crpg:battle-map:nowhere"},
       "party": [{"id": "vance", "class": "fighter", "x": 0, "y": 0}],
       "enemies": [{"id": "guard", "monster": "corrupted-guard", "x": 20, "y": 0}]}
      """
    And loading this scenario fails with "has objects but no blockout grid"
      """
      {"name": "Unbuilt", "seed": 1,
       "map": {"title": "Unbuilt", "width": 40, "height": 40,
               "mapObjects": [{"objectId": "w", "objectType": "wall", "shape": "line", "position": [20, 0], "to": [20, 40]}]},
       "party": [{"id": "vance", "class": "fighter", "x": 0, "y": 0}],
       "enemies": [{"id": "guard", "monster": "corrupted-guard", "x": 30, "y": 0}]}
      """

  Scenario: Every map and scenario conforms to its KGraph shapes and every blockout is current
    Then every scenario file conforms to the robos:CRPGTestScenario SHACL shapes
    And every blockout map is up to date with its objects
