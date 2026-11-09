@roadmap_controls
Feature: Tactical commands and camera options
  Scenario: Ping both views, center on the army, and show an emplaced Howitzer's ranges
    Given an RTS test scenario
      """
      {"name":"Tactical overview","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"gun","type":"howitzer_emplaced","owner":1,"x":30,"y":25},
                {"id":"guard","type":"rifleman","owner":1,"x":42,"y":31}]}
      """
    When the commander frames (35, 28) at zoom height 40
    And the commander presses "Alt+G"
    And the commander clicks a targeted point at (40, 31)
    And the commander presses "Alt+G"
    And the commander targets minimap point (54, 31)
    Then both personal pings are visible to the commander
    And "guard" has orders "none"
    When the commander presses "F2"
    And the commander presses "Home"
    Then the camera frames (36, 28) at zoom height 40
    And the commander has selected "gun,guard"
    When the commander presses "PageUp"
    Then the camera frames (36, 28) at zoom height 36
    When the commander presses "PageDown"
    And the commander presses "Alt+R"
    Then the camera frames (36, 28) at zoom height 40
    And the selected Howitzer shows both weapon ranges
    When the commander presses "Alt+R"
    Then no weapon ranges are shown

  Scenario: One activation queues waypoints and undo preserves the current order
    Given an RTS test scenario
      """
      {"name":"Queued waypoints","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":30,"y":26}]}
      """
    When the commander clicks unit "scout"
    And the commander presses "M"
    And the commander holds Shift for waypoints
    And the commander targets minimap point (40, 26) with Shift
    And the commander targets minimap point (48, 26) with Shift
    And the commander releases Shift for waypoints
    Then "scout" has orders "move,move"
    When the commander presses "Ctrl+Backspace"
    Then "scout" has orders "move"
    When the commander presses "Ctrl+Backspace"
    Then "scout" has orders "move"

  Scenario: Idle producers can be selected and both Brood rallies can be reset
    Given an RTS test scenario
      """
      {"name":"Idle production","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"nest","type":"brood_nest","owner":1,"x":30,"y":26},
                {"id":"hall","type":"muster_hall","owner":1,"x":43,"y":25},
                {"id":"foundation","type":"muster_hall","owner":1,"x":32,"y":38,"build_progress":0.3}]}
      """
    When the commander presses "Comma"
    Then the commander has selected "nest"
    When the commander clicks the idle production button
    Then the commander has selected "hall"
    When the commander presses "Ctrl+Comma"
    Then the commander has selected "nest,hall"
    When the commander clicks unit "nest"
    And the commander presses "Y"
    And the commander targets minimap point (60, 44)
    And the commander presses "G"
    And the commander targets minimap point (54, 43)
    Then the Nest has independent army and Forager rallies
    When the commander presses "Alt+Y"
    Then both Nest rally routes are reset

  Scenario: Camera speed and Shift-only order lines persist through the title
    Given an RTS test scenario
      """
      {"name":"Camera and order preferences","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":30,"y":26}]}
      """
    When the commander returns to the title from the battlefield
    And the commander clicks Settings on the title screen
    And the commander chooses fast panning and Shift-only order lines
    And the commander presses "Escape"
    And the commander clicks Resume Match on the title
    Then the battle view is ready
    And the fast pan setting is active
    And selected order lines are hidden
    When the commander holds Shift for waypoints
    Then selected order lines are visible
    When the commander releases Shift for waypoints
    Then selected order lines are hidden
