@worker_macro
Feature: Workers keep the economy moving
  Scenario: A worker returns cargo and keeps its mineral assignment
    Given an RTS test scenario
      """
      {"name":"Worker assignments","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":20,"y":24},
                {"id":"miner","type":"pioneer","owner":1,"x":37,"y":24},
                {"id":"gas_worker","type":"pioneer","owner":1,"x":25,"y":38},
                {"id":"tap","type":"aether_tap","owner":1,"x":24,"y":42}],
       "resources":[{"id":"ore","type":"crystal_field","x":40,"y":24,"amount":500},
                    {"type":"crystal_field","x":40,"y":30,"amount":500},
                    {"type":"aether_vent","x":24,"y":42,"amount":500}]}
      """
    When "miner" is assigned to "ore"
    And "gas_worker" is assigned to "tap"
    And the simulation advances 128 ticks
    Then "home" shows 1 of 4 workers assigned
    And "tap" shows 1 of 3 workers assigned
    When the commander clicks unit "miner"
    And the commander presses "C"
    Then "miner" has orders "return_cargo,harvest"
    When the simulation advances 220 ticks
    Then player 1 has collected at least 5 crystal
    And "miner" has orders "harvest"

  Scenario: A foundation keeps progress through a handoff and another can be refunded
    Given an RTS test scenario
      """
      {"name":"Construction handoff","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"home","type":"colony_hub","owner":1,"x":19,"y":24},
                {"type":"silo","owner":1,"x":19,"y":34},
                {"id":"builder","type":"pioneer","owner":1,"x":30,"y":24},
                {"id":"backup","type":"pioneer","owner":1,"x":31,"y":30}]}
      """
    When the commander clicks unit "builder"
    And the commander presses "B"
    Then the worker build page is "basic"
    And no placement is active
    When the commander presses "B"
    Then the command card is targeting "build_muster_hall"
    When the commander presses "S"
    Then the command card is targeting "build_silo"
    When the commander places a building at (35, 24)
    And the simulation advances 256 ticks
    And the commander presses "T"
    Then construction at (35, 24) stays unfinished without a builder
    When the commander clicks unit "backup"
    And the commander right-clicks terrain at (35, 24)
    And the simulation advances 2048 ticks
    Then a finished "silo" stands at (35, 24)
    And player 1 has 300 crystal, 150 aether and 2 supply used
    When the commander presses "B"
    And the commander presses "S"
    And the commander places a building at (46, 24)
    And the simulation advances 150 ticks
    And the commander selects the building at (46, 24)
    And the commander presses "X"
    Then no building stands at (46, 24)
    And player 1 has 275 crystal, 150 aether and 2 supply used

  Scenario: Pioneers repair damaged machinery and place several buildings with one hotkey
    Given an RTS test scenario
      """
      {"name":"Repair and placement","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":19,"y":24},
                {"id":"builder","type":"pioneer","owner":1,"x":31,"y":28},
                {"id":"tank","type":"howitzer","owner":1,"x":34,"y":28,"hp":50}]}
      """
    When the commander clicks unit "builder"
    Then "builder" has Auto-Repair on
    When the commander right-clicks worker card slot 8
    Then "builder" has Auto-Repair off
    When the commander presses "R"
    And the commander places a building at (34, 28)
    Then "builder" has orders "repair"
    When the simulation advances 960 ticks
    Then "tank" is fully repaired at a crystal cost
    When the commander presses "B"
    And the commander presses "S"
    And the commander holds Shift
    And the commander Shift-places a building at (40, 22)
    And the commander Shift-places a building at (40, 22)
    And the commander Shift-places a building at (47, 22)
    And the commander Shift-places a building at (47, 29)
    Then "builder" has orders "build,build,build"
    And a queued "silo" blueprint stands at (40, 22)
    And a queued "silo" blueprint stands at (47, 22)
    And a queued "silo" blueprint stands at (47, 29)
    And no building stands at (40, 22)
    And no building stands at (47, 22)
    And no building stands at (47, 29)
    When the commander releases Shift
    Then the worker build page is "root"
    And no placement is active
    When the commander presses "S"
    Then the map shows 0 queued building blueprints
    When the commander presses "B"
    And the commander presses "S"
    And the commander holds Shift
    And the commander Shift-places a building at (40, 22)
    And the commander Shift-places a building at (47, 22)
    And the commander Shift-places a building at (47, 29)
    And the commander releases Shift
    And the commander selects the building at (47, 22)
    And the commander presses "Escape"
    Then "builder" has orders "build,build"
    And the map shows 2 queued building blueprints
    And a queued "silo" blueprint stands at (40, 22)
    And a queued "silo" blueprint stands at (47, 29)
    When the simulation advances 420 ticks
    Then construction at (40, 22) is progressing
    And the map shows 1 queued building blueprints
    When the simulation advances 4200 ticks
    Then a finished "silo" stands at (40, 22)
    And no building stands at (47, 22)
    And a finished "silo" stands at (47, 29)
    And the map shows 0 queued building blueprints

  Scenario: A group assigns separate Pioneers to foundations and can go back to gathering
    Given an RTS test scenario
      """
      {"name":"Pioneer construction assignments","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":19,"y":24},
                {"id":"near","type":"pioneer","owner":1,"x":33,"y":28},
                {"id":"far","type":"pioneer","owner":1,"x":31,"y":36}],
       "resources":[{"type":"crystal_field","x":47,"y":34,"amount":500}]}
      """
    When the commander clicks unit "near"
    And the commander Ctrl-clicks unit "near"
    Then the commander has selected "near,far"
    When the commander presses "V"
    Then the worker build page is "root"
    When the commander clicks worker card slot 11
    Then the worker build page is "basic"
    When the commander presses "S"
    And the commander places a building at (38, 26)
    And the commander presses "B"
    And the commander presses "S"
    And the commander places a building at (43, 24)
    Then "near" has orders "build"
    And "far" has orders "build"
    When the commander clicks unit "near"
    And the commander Shift-right-clicks at (47, 34)
    Then "near" has orders "build,harvest"
    And "far" has orders "build"

  Scenario: Shift-placement uses one Forager per morph and Escape restores the worker
    Given an RTS test scenario
      """
      {"name":"Brood construction assignments","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"brood_nest","owner":1,"x":19,"y":24},
                {"id":"near","type":"forager","owner":1,"x":32,"y":26},
                {"id":"far","type":"forager","owner":1,"x":32,"y":31}]}
      """
    When the commander Ctrl-clicks unit "near"
    And the commander presses "V"
    And the commander presses "S"
    Then the command card is targeting "build_blight_spire"
    When the commander presses "Escape"
    And the commander presses "Escape"
    And the commander presses "B"
    And the commander presses "P"
    And the commander holds Shift
    And the commander Shift-places a building at (36, 24)
    And the commander Shift-places a building at (42, 24)
    And the commander Shift-places a building at (46, 29)
    Then "near" has orders "build"
    And "far" has orders "build"
    When the commander releases Shift
    And the simulation advances 205 ticks
    Then player 1 has 250 crystal, 150 aether and 0 supply used
    And construction at (36, 24) is progressing
    When the commander selects the building at (36, 24)
    And the commander presses "Escape"
    Then no building stands at (36, 24)
    And player 1 has 306 crystal, 150 aether and 1 supply used

  Scenario: A Mote starts two powered summons and resumes gathering
    Given an RTS test scenario
      """
      {"name":"Concord construction assignments","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"heartstone","owner":1,"x":20,"y":26},
                {"type":"resonator","owner":1,"x":31,"y":21},
                {"id":"builder","type":"mote","owner":1,"x":32,"y":27}],
       "resources":[{"type":"crystal_field","x":47,"y":32,"amount":500}]}
      """
    When the commander clicks unit "builder"
    And the commander presses "B"
    And the commander presses "G"
    And the commander holds Shift
    And the commander Shift-places a building at (39, 23)
    And the commander Shift-places a building at (46, 24)
    And the commander Shift-right-clicks at (47, 32)
    And the commander releases Shift
    Then "builder" has orders "build,build,harvest"
    When the simulation advances 800 ticks
    Then "builder" has orders "harvest"
    And construction at (39, 23) is progressing
    And construction at (46, 24) is progressing
