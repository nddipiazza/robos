@tactical_selection
Feature: Select the army, idle workers, or a particular unit type
  Scenario: Type selection stays on screen and army selection spans the map
    Given an RTS test scenario
      """
      {"name":"Selection drill","paused":true,"decor":false,"map":{"width":128,"height":96},
       "units":[{"id":"alpha","type":"rifleman","owner":1,"x":24,"y":26},
                {"id":"bravo","type":"rifleman","owner":1,"x":33,"y":28},
                {"id":"breach","type":"breacher","owner":1,"x":42,"y":26},
                {"id":"siege","type":"howitzer","owner":1,"x":50,"y":26},
                {"id":"remote","type":"rifleman","owner":1,"x":112,"y":72},
                {"id":"opponent","type":"rifleman","owner":2,"x":40,"y":36},
                {"id":"idle_a","type":"pioneer","owner":1,"x":23,"y":32},
                {"id":"idle_b","type":"pioneer","owner":1,"x":31,"y":34},
                {"id":"busy","type":"pioneer","owner":1,"x":25,"y":39},
                {"type":"colony_hub","owner":1,"x":20,"y":48}]}
      """
    When player 1 issues "move" to unit "busy" toward (28.0, 50.0)
    And the commander frames (35, 28) at zoom height 40
    And the commander Ctrl-clicks unit "alpha"
    Then the commander has selected "alpha,bravo"
    When the commander presses "F2"
    Then the commander has selected "alpha,bravo,breach,siege,remote"
    And the active subgroup is "rifleman"
    When the commander presses "Shift+Tab"
    Then the active subgroup is "howitzer"
    When the commander presses "Tab"
    Then the active subgroup is "rifleman"
    When the commander presses "Ctrl+Period"
    Then the commander has selected "idle_a,idle_b"
    And the camera frames (35, 28) at zoom height 40
