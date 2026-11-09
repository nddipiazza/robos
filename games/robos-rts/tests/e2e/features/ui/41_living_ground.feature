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
