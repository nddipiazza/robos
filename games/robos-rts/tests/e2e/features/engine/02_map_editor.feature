Feature: Starfall Command Map Editor authors playable RTS maps
  As a level designer
  I want to paint terrain, place resources and units, and configure AI directives in the Map Editor
  So that the maps I author save as KGraph JSON-LD scenarios and play identically in the 64Hz engine.

  Scenario: A map authored in the Map Editor validates, saves to JSON-LD, and playtests in the engine
    Given the Map Editor is open with a new 96x64 map
    When the editor names the map "Editor Proving Grounds"
    When the editor paints a "high_ground" rect at (0, 0) sized 30x64
    And the editor paints a "ramps" rect at (26, 26) sized 10x12
    And the editor paints a "obstacles" rect at (48, 0) sized 6x22
    And the editor places a "mineral_field" at (6, 30)
    And the editor places 6 "marine" units for player 1 at (40, 30)
    And the editor places 8 "swarmling" units for player 2 at (70, 30)
    And the editor places 1 "zealot" units for player 2 at (70, 50)
    Then the editor reports 1 validation issue mentioning "player 2 is monsters"
    When the editor undoes the last edit
    And the editor sets player 2 AI directive "swarm_rush" targeting (40, 30)
    Then the editor reports no validation issues
    When the editor saves the map to "user://e2e_editor_map.jsonld"
    And the RTS scenario file "user://e2e_editor_map.jsonld" is loaded
    Then the engine map is 96x64 with 3 terrain features
    And player 1 has at least 6 surviving "marine" units
    When the editor playtests the map
    And the simulation advances 480 ticks
    Then the engine is running "Editor Proving Grounds" at tick 480 or later
    And player 2 has fewer than 8 surviving "swarmling" units
