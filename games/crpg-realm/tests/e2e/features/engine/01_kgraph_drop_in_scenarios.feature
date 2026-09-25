@engine
Feature: Drop-in robos:CRPGTestScenario scenarios from the knowledge graph
  A test scenario is a KGraph node: a battle map, the game state (party, enemies,
  NPC allies, traps) and Infinity AI directives. Any conforming node can be dropped
  into scenarios/ and the Infinity AI engine plays it to the end with a clean audit.

  Scenario Outline: The Infinity AI plays the "<scenario>" scenario to the end
    Given the cRPG test scenario "<scenario>" from the knowledge graph
    When the Infinity AI plays the battle to the end
    Then the outcome is "<outcome>"
    And the engine audit is clean
    And replaying the scenario produces the identical battle

    Examples:
      | scenario               | outcome |
      | crypt-skeleton-patrol  | victory |
      | garrison-keep-malakor  | victory |
      | homestead-hound-pack   | victory |
      | golem-attrition        | victory |
      | trapped-corridor       | victory |

  Scenario: Every scenario in the knowledge graph conforms to its SHACL shapes
    Then every scenario file conforms to the robos:CRPGTestScenario SHACL shapes

  Scenario: The trapped-corridor rogue plays exactly the inputs its directive scripts
    Given the cRPG test scenario "trapped-corridor" from the knowledge graph
    When the Infinity AI plays up to 2 rounds
    Then the event log shows "Elora searches"
    And the event log shows "Elora tries to disarm dart_plate"
    And the engine audit is clean

  Scenario: A scenario that names unknown content is rejected before the battle starts
    Then loading this scenario fails with "unknown monster 'beholder'"
      """
      {"name": "Bad content", "seed": 1,
       "party": [{"id": "vance", "class": "fighter"}],
       "enemies": [{"id": "eye", "monster": "beholder"}]}
      """

  Scenario: A scenario with an invalid directive or a combatant off the map is rejected
    Then loading this scenario fails with "directive controller must be infinity_ai, scripted or idle"
      """
      {"name": "Bad directive", "seed": 1, "map": {"width": 50, "height": 50},
       "party": [{"id": "vance", "class": "fighter", "x": 10, "y": 10}],
       "enemies": [{"id": "guard", "monster": "corrupted-guard", "x": 40, "y": 10}],
       "directives": [{"actor": "vance", "controller": "telepathy"}]}
      """
    And loading this scenario fails with "starts outside the 50x50 ft map"
      """
      {"name": "Off the map", "seed": 1, "map": {"width": 50, "height": 50},
       "party": [{"id": "vance", "class": "fighter", "x": 10, "y": 10}],
       "enemies": [{"id": "guard", "monster": "corrupted-guard", "x": 90, "y": 10}]}
      """
