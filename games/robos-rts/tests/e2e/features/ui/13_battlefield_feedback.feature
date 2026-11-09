@battlefield_feedback
Feature: RTS command profiles and battlefield feedback
  Scenario: Settings enable grid commands and mouse edge scrolling
    Given an RTS test scenario
      """
      {"name":"Command profiles","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":27}]}
      """
    When the commander returns to the title from the battlefield
    And the commander clicks Settings on the title screen
    And the commander selects Grid and turns edge scrolling On
    And the commander presses "Escape"
    And the commander clicks Resume Match on the title
    Then the battle view is ready
    When the commander clicks unit "scout"
    And the commander presses "R"
    Then the command card is targeting "attack"
    When the commander presses "Escape"
    Then moving the mouse to the edge pans the camera
    When the commander returns to the title from the battlefield
    And the commander clicks Settings on the title screen
    And the commander selects Standard and turns edge scrolling Off
    And the commander presses "Escape"
    And the commander clicks Resume Match on the title
    Then the battle view is ready

  Scenario: Pause and the temporary health-bar overlay use independent shortcuts
    Given an RTS test scenario
      """
      {"name":"Tactical pause","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":27}]}
      """
    When the commander presses "F12"
    Then the live battle clock advances
    When the commander presses "Pause"
    Then the live battle clock is paused
    When the commander holds Alt
    Then overhead health bars are temporarily shown
    When the commander releases Alt
    Then overhead health bars return to their configured mode

  Scenario: Portrait modifiers isolate a unit type and remove a specific unit
    Given an RTS test scenario
      """
      {"name":"Portrait controls","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"alpha","type":"rifleman","owner":1,"x":28,"y":27},
                {"id":"bravo","type":"rifleman","owner":1,"x":35,"y":29},
                {"id":"heavy","type":"breacher","owner":1,"x":37,"y":23}]}
      """
    When the commander presses "F2"
    And the commander Ctrl-clicks selection portrait 2
    Then the commander has selected "alpha,bravo"
    When the commander Shift-clicks selection portrait 2
    Then the commander has selected "alpha"

  Scenario: Multi-building queues and the supply breakdown show live production
    Given an RTS test scenario
      """
      {"name":"Production overview","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":18,"y":22},
                {"type":"silo","owner":1,"x":25,"y":35,"build_progress":0.25},
                {"id":"hall_a","type":"muster_hall","owner":1,"x":32,"y":26},
                {"id":"hall_b","type":"muster_hall","owner":1,"x":43,"y":27}]}
      """
    When the commander Ctrl-clicks unit "hall_a"
    And the commander presses "Shift+A"
    And the simulation advances 96 ticks
    Then the two halls have a balanced batch of five units in production
    And player 1 has 150 crystal, 150 aether and 5 supply used
    And the multi-building production and supply HUD is captured

  Scenario: Only visible deposits can be inspected and a finite field reports depletion
    Given an RTS test scenario
      """
      {"name":"Deposit reserves","paused":true,"decor":false,"fog_of_war":true,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":19,"y":22},
                {"id":"miner","type":"pioneer","owner":1,"x":29,"y":26}],
       "resources":[{"id":"near","type":"crystal_field","x":34,"y":26,"amount":5},
                    {"id":"hidden","type":"crystal_field","x":78,"y":27,"amount":80}]}
      """
    When the commander clicks deposit "hidden"
    Then no deposit is inspected
    When the commander clicks deposit "near"
    Then deposit "near" is inspected with 5 reserves
    When the worker gathers from deposit "near"
    And the simulation advances 240 ticks
    Then deposit "near" is inspected with 0 reserves
    And the commander receives the crystal depletion notice
    And the depleted deposit HUD is captured

  Scenario: Shift queues Stop and Hold Position without interrupting a move
    Given an RTS test scenario
      """
      {"name":"Queued stationary orders","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":27}]}
      """
    When the commander clicks unit "scout"
    And the commander right-clicks terrain at (39, 27)
    And the commander presses "Shift+S"
    And the commander Shift-right-clicks terrain at (50, 27)
    And the commander presses "Shift+H"
    Then "scout" has orders "move,stop,move,hold_position"
    When the simulation advances 330 ticks
    Then unit "scout" is within 2.0 units of (50.0, 27.0)
    And "scout" has orders "hold_position"
    When the commander presses "S"
    Then "scout" has orders "none"
