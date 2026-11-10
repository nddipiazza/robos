@power_overlay
Feature: Resonator coverage shows which Waystones rely on a single source
  Scenario: Overlap, single-source loss, and new power are visible without interrupting commands
    Given an RTS test scenario
      """
      {"name":"Concord power coverage","paused":true,"decor":false,"fog_of_war":true,"victory":"all_structures",
       "players":{"1":{"faction":"aliens"}},
       "map":{"width":112,"height":72,"high_ground":[{"x":98,"y":23,"w":14,"h":18}]},
       "units":[{"id":"west_source","type":"resonator","owner":1,"x":42,"y":31,"hp":1,"shields":0},
                {"id":"east_source","type":"resonator","owner":1,"x":62,"y":31},
                {"id":"west","type":"waystone","owner":1,"x":30,"y":31},
                {"id":"overlap","type":"waystone","owner":1,"x":52,"y":31},
                {"id":"edge","type":"waystone","owner":1,"x":80,"y":31},
                {"id":"uncovered","type":"waystone","owner":1,"x":92,"y":31},
                {"id":"future","type":"resonator","owner":1,"x":29,"y":44,"build_progress":0.93},
                {"id":"builder","type":"mote","owner":1,"x":35,"y":47},
                {"id":"hidden_source","type":"resonator","owner":2,"x":103,"y":31},
                {"id":"gun","type":"howitzer_emplaced","owner":2,"x":61,"y":47}]}
      """
    When player 2 issues "hold_fire" to unit "gun" toward (61.0, 47.0)
    And the commander frames (61, 34) at zoom height 90
    Then the infrastructure overlay is hidden
    When the commander clicks the projected body of "west_source" at (0.0, 1.15)
    Then only power fields "west_source,east_source" are shown
    And only "west_source" is the highlighted power source
    And the power overlay shows "west" as "at_risk" with "west_source"
    And the power overlay shows "overlap" as "redundant" with "west_source,east_source"
    And the power overlay shows "edge" as "single" with "east_source"
    And the power overlay shows "uncovered" as "unpowered" with "none"
    And the opposing Resonator is still hidden
    And the power coverage overlay is captured
    When the commander clicks the projected body of "east_source" at (0.0, 1.15)
    Then only "east_source" is the highlighted power source
    And the power overlay shows "edge" as "at_risk" with "east_source"
    When the opposing gun fires on the western power source
    And the simulation advances 32 ticks
    Then only power fields "east_source" are shown
    And the power overlay shows "west" as "unpowered" with "none"
    And the power overlay shows "overlap" as "at_risk" with "east_source"
    When the commander clicks the projected body of "overlap" at (0.0, 1.15)
    And the commander presses "Y"
    And the commander clicks a targeted point at (55, 40)
    Then the "overlap" Waystone has a rally at (55, 40)
    And the power overlay shows "overlap" as "single" with "east_source"
    When the commander clicks the projected body of "builder" at (0.0, 1.15)
    Then the infrastructure overlay is hidden
    When the commander presses "B"
    And the commander presses "G"
    Then only power fields "east_source" are shown
    When the commander presses "Escape"
    Then the infrastructure overlay is hidden
    When the commander right-clicks the projected body of "future" at (0.0, 1.15)
    And the simulation advances 250 ticks
    And the commander clicks the projected body of "west" at (0.0, 1.15)
    Then only power fields "east_source,future" are shown
    And the power overlay shows "west" as "single" with "future"
