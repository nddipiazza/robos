@defense
Feature: Defend a base and control when squads fire
  Scenario: A Pioneer pays for a turret that fights independently
    Given an RTS test scenario
      """
      {"name":"Sentry defense","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"type":"colony_hub","owner":1,"x":19,"y":22},
                {"type":"muster_hall","owner":1,"x":24,"y":34},
                {"id":"builder","type":"pioneer","owner":1,"x":29,"y":26},
                {"id":"raider","type":"pioneer","owner":2,"x":46,"y":25}]}
      """
    When the commander clicks unit "builder"
    And the commander presses "B"
    And the commander presses "T"
    And the commander places a building at (35, 25)
    And the simulation advances 720 ticks
    Then a finished "sentry_turret" stands at (35, 25)
    And the Sentry fired without an attack order
    And player 1 has 275 crystal, 150 aether and 1 supply used

  Scenario: A Skirmisher toggles cloak without giving enemies a target
    Given an RTS test scenario
      """
      {"name":"Phase Cloak","paused":true,"decor":false,"fog_of_war":true,"map":{"width":96,"height":64},
       "units":[{"id":"scout","type":"skirmisher","owner":1,"x":29,"y":26},
                {"id":"guard","type":"rifleman","owner":2,"x":40,"y":28}]}
      """
    When the commander clicks unit "scout"
    And the commander presses "C"
    Then "scout" is cloaked and hidden from player 2
    When the commander presses "C"
    Then player 2 can see the uncloaked "scout"

  Scenario: Hold Fire, Force Attack and ungrouped reinforcements use distinct controls
    Given an RTS test scenario
      """
      {"name":"Fire discipline","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"alpha","type":"rifleman","owner":1,"x":27,"y":27},
                {"id":"reserve","type":"rifleman","owner":1,"x":39,"y":30},
                {"id":"ally","type":"pioneer","owner":1,"x":32,"y":22}]}
      """
    When the commander clicks unit "alpha"
    And the commander presses "K"
    And the commander presses "Ctrl+1"
    Then "alpha" is holding fire
    When the commander presses "Shift+F2"
    Then the commander has selected "reserve"
    When the commander presses "F2"
    Then the commander has selected "alpha,reserve"
    When the commander presses "1"
    And the commander presses "A"
    And the commander Alt-clicks the attack target at (32, 22)
    Then "alpha" has orders "force_attack"
    When the simulation advances 24 ticks
    Then "ally" has taken damage

  Scenario: Infantry can walk into a bunker, join nearby troops and unload
    Given an RTS test scenario
      """
      {"name":"Bunker garrison","paused":true,"decor":false,"map":{"width":96,"height":64},
       "units":[{"id":"bunker","type":"field_bunker","owner":1,"x":43,"y":29},
                {"id":"heavy","type":"breacher","owner":1,"x":25,"y":28},
                {"id":"rifle","type":"rifleman","owner":1,"x":47,"y":29},
                {"id":"spare","type":"rifleman","owner":1,"x":47,"y":33},
                {"id":"waiting","type":"rifleman","owner":1,"x":25,"y":35},
                {"id":"medic","type":"triage_specialist","owner":1,"x":43,"y":34},
                {"id":"worker","type":"pioneer","owner":1,"x":43,"y":24}]}
      """
    When the commander clicks unit "heavy"
    And the commander right-clicks the projected body of "bunker" at (0.0, 1.9)
    Then "heavy" has an "enter_bunker" order for "bunker"
    When the simulation advances 300 ticks
    Then "bunker" has 1 garrisoned units
    When the commander clicks unit "bunker"
    And the commander presses "L"
    Then "bunker" has 4 garrisoned units
    And "worker" has orders "none"
    When the commander clicks unit "waiting"
    And the commander right-clicks the projected body of "bunker" at (0.0, 1.9)
    Then the commander is told the bunker is full
    And "waiting" has orders "none"
    When the commander clicks unit "bunker"
    And the commander presses "U"
    Then "bunker" has 0 garrisoned units
    When the commander clicks unit "heavy"
    Then the commander has selected "heavy"
