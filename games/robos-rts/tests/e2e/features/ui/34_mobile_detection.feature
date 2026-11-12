@mobile_detection
Feature: A paid Concord Veilseeker reveals concealed enemies within its ring
  Scenario: Detection follows the skimmer and ends on withdrawal or destruction
    Given an RTS test scenario
      """
      {"name":"Veilseeker field detection","paused":true,"decor":false,"fog_of_war":true,"victory":"all_structures",
       "players":{"1":{"faction":"aliens","crystal":400,"aether":180}},
       "map":{"width":112,"height":68,"terrain_tiles":[{"x":68,"y":32,"terrain":"brush"}]},
       "units":[{"id":"heart","type":"heartstone","owner":1,"x":19,"y":20},
                {"id":"source","type":"waystone","owner":1,"x":31,"y":24},
                {"id":"power","type":"resonator","owner":1,"x":30,"y":33},
                {"id":"warden","type":"skirmisher","owner":1,"x":49,"y":38},
                {"id":"cloaker","type":"skirmisher","owner":2,"x":69,"y":27},
                {"id":"brush_guard","type":"rifleman","owner":2,"x":70,"y":34},
                {"id":"gun","type":"howitzer_emplaced","owner":2,"x":88,"y":26},
                {"id":"enemy","type":"colony_hub","owner":2,"x":104,"y":52}]}
      """
    When player 1 issues "hold_fire" to unit "warden" toward (49.0, 38.0)
    And player 2 issues "hold_fire" to unit "cloaker" toward (69.0, 27.0)
    And player 2 issues "hold_fire" to unit "brush_guard" toward (70.0, 34.0)
    And player 2 issues "hold_fire" to unit "gun" toward (88.0, 26.0)
    And the commander frames (48, 31) at zoom height 72
    And the commander clicks the projected body of "source" at (0.0, 1.15)
    And the commander presses "T"
    And the commander presses "V"
    Then player 1 has 255 crystal, 105 aether and 2 supply used
    When the simulation advances 1791 ticks
    Then no "veilseeker" exists
    When the simulation advances 1 ticks
    And the commander selects the completed "veilseeker"
    And the commander right-clicks terrain at (53, 26)
    And the simulation advances 768 ticks
    And player 2 issues "phase_cloak" to unit "cloaker" toward (69.0, 27.0)
    And the commander selects the Farsight Wisp body
    And the commander right-clicks terrain at (63, 25)
    And the simulation advances 220 ticks
    Then the Farsight Wisp is airborne near (63, 25)
    And the scouting cell at (69, 27) is visible
    And the scouting cell at (70, 34) is visible
    And the concealed enemies are hidden
    And no selected mobile detection ring is shown
    When the commander frames (61, 30) at zoom height 47
    And the commander selects the completed "veilseeker"
    Then the Veilseeker displays a 12-unit detection ring
    When the commander right-clicks terrain at (63, 29)
    And the simulation advances 128 ticks
    Then the concealed enemies are revealed
    And the Veilseeker displays a 12-unit detection ring
    And the battlefield is captured as "veilseeker-detection"
    When the commander clicks the projected body of "warden" at (0.0, 1.15)
    And the commander right-clicks the projected body of "cloaker" at (0.0, 1.15)
    Then "warden" has orders "attack_target"
    When player 1 issues "stop" to unit "warden" toward (49.0, 38.0)
    And the commander selects the completed "veilseeker"
    And the commander right-clicks terrain at (53, 26)
    And the simulation advances 128 ticks
    Then the scouting cell at (69, 27) is visible
    And the concealed enemies are hidden
    And the warden cannot target the concealed Skirmisher
    When the commander right-clicks terrain at (63, 29)
    And the simulation advances 128 ticks
    Then the concealed enemies are revealed
    When the opposing gun targets the Veilseeker
    And the simulation advances 256 ticks
    Then no "veilseeker" exists
    And no selected mobile detection ring is shown
    And the scouting cell at (69, 27) is visible
    And the concealed enemies are hidden
    And the warden cannot target the concealed Skirmisher
    And player 1 has 255 crystal, 105 aether and 3 supply used
