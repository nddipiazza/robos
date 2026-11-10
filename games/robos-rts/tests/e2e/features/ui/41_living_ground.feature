@living_ground
Feature: Brood living ground appears on the battlefield and minimap
  Scenario: A scout reveals the spread and loses sight as it retreats
    Given an RTS test scenario
      """
      {"name":"Brood living ground","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":100,"height":64},
       "units":[{"id":"scout","type":"pioneer","owner":1,"x":24,"y":32},
                {"id":"nest","type":"brood_nest","owner":2,"x":74,"y":32}]}
      """
    When the commander frames (48, 32) at zoom height 64
    And the simulation advances 1600 ticks
    Then the rendered living ground is hidden
    When the commander clicks unit "scout"
    And the commander right-clicks terrain at (47, 32)
    And the simulation advances 640 ticks
    Then the rendered living ground matches the visible map cells
    And the battlefield is captured as "living-ground-scout"
    When the commander right-clicks terrain at (24, 32)
    And the simulation advances 640 ticks
    Then the rendered living ground is hidden

  Scenario: A Brood commander sees the established layer around the Nest
    Given an RTS test scenario
      """
      {"name":"Brood territory","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":96,"height":64},
       "players":{"1":{"name":"Gnarl Brood","faction":"monsters"}},
       "units":[{"id":"nest","type":"brood_nest","owner":1,"x":46,"y":34}]}
      """
    When the commander frames (46, 34) at zoom height 63
    And the simulation advances 1600 ticks
    Then the rendered living ground matches the visible map cells
    And the battlefield is captured as "living-ground-brood"

  Scenario: A selected Skitterling shows the live speed modifier as it crosses the layer
    Given an RTS test scenario
      """
      {"name":"Living ground pace","paused":true,"decor":false,
       "map":{"width":112,"height":72},
       "players":{"1":{"name":"Gnarl Brood","faction":"monsters"}},
       "units":[{"type":"brood_nest","owner":1,"x":46,"y":34},
                {"id":"runner","type":"skitterling","owner":1,"x":18,"y":42}]}
      """
    When the simulation advances 1600 ticks
    And the commander frames (44, 42) at zoom height 74
    And the commander Ctrl-clicks unit "runner"
    Then the Skitterling tooltip shows 9.8 speed with the living ground bonus "inactive"
    When the commander right-clicks terrain at (81, 42)
    And the simulation advances 100 ticks
    Then the Skitterling tooltip shows 12.7 speed with the living ground bonus "active"
    When the simulation advances 370 ticks
    Then the Skitterling tooltip shows 9.8 speed with the living ground bonus "inactive"

  Scenario: Pay for a Growth Node and watch its extension recede after combat
    Given an RTS test scenario
      """
      {"name":"Brood growth node","paused":true,"decor":false,
       "map":{"width":112,"height":72},
       "players":{"1":{"name":"Gnarl Brood","faction":"monsters"}},
       "units":[{"type":"brood_nest","owner":1,"x":30,"y":34},
                {"id":"grower","type":"forager","owner":1,"x":50,"y":34},
                {"id":"artillery","type":"howitzer_emplaced","owner":2,"x":78,"y":34}]}
      """
    When the artillery holds fire for the living ground test
    And the simulation advances 1600 ticks
    And the commander frames (51, 34) at zoom height 79
    And the commander Ctrl-clicks unit "grower"
    And the commander presses "B"
    And the commander presses "C"
    And the commander places a Growth Node at (70, 34)
    Then no "brood_growth_node" exists
    And player 1 has 400 crystal, 150 aether and 1 supply used
    When the commander places a Growth Node at (54, 34)
    And the simulation advances 1000 ticks
    Then a finished "brood_growth_node" stands at (54, 34)
    And player 1 has 340 crystal, 150 aether and 0 supply used
    And the rendered living ground covers (70, 34)
    And the battlefield is captured as "living-ground-node"
    When the artillery destroys the Growth Node
    Then the rendered living ground covers (70, 34)
    When the simulation advances 240 ticks
    Then the rendered living ground clears (70, 34)
    And the rendered living ground covers (58, 34)
    And the battlefield is captured as "living-ground-recession"
