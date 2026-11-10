@roadmap_economy
Feature: Gas assignment and construction feedback
  Scenario: Gas transfer from the battlefield fills only three places
    Given an RTS test scenario
      """
      {"name":"Gas transfer command","paused":true,"decor":false,"map":{"width":96,"height":64},
       "resources":[{"id":"vent","type":"aether_vent","x":44,"y":26,"amount":1200,"rich":true}],
       "units":[{"type":"colony_hub","owner":1,"x":18,"y":22},
                {"id":"tap","type":"aether_tap","owner":1,"x":44,"y":26,"build_progress":0.4},
                {"id":"p1","type":"pioneer","owner":1,"x":26,"y":26},
                {"id":"p2","type":"pioneer","owner":1,"x":29,"y":26},
                {"id":"p3","type":"pioneer","owner":1,"x":32,"y":26},
                {"id":"p4","type":"pioneer","owner":1,"x":35,"y":26}]}
      """
    When the commander Ctrl-clicks unit "p2"
    And the commander presses "Alt+H"
    And the commander clicks a targeted point at (44, 26)
    And the simulation advances 150 ticks
    Then three workers are assigned to the unfinished extractor
    And the remaining worker is still idle

  Scenario: A build preview shows the snapped vent and supports actual placement
    Given an RTS test scenario
      """
      {"name":"Build grid preview","paused":true,"decor":false,"map":{"width":96,"height":64},
       "resources":[{"id":"vent","type":"aether_vent","x":45,"y":27,"amount":1200,"rich":true}],
       "units":[{"type":"colony_hub","owner":1,"x":17,"y":22},
                {"id":"builder","type":"pioneer","owner":1,"x":30,"y":27}]}
      """
    When the commander clicks unit "builder"
    And the commander presses "B"
    And the commander presses "R"
    And the snapped build grid is captured near (42, 28)
    And the commander clicks a targeted point at (42, 28)
    And the simulation advances 700 ticks
    Then a finished "aether_tap" stands at (45, 27)
