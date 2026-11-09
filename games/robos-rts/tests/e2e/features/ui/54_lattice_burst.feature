@lattice_burst
Feature: A Concord Warden warns both sides before damaging an area
  Scenario: A Warden targets Lattice Burst and shows its warning and active radius
    Given an RTS test scenario
      """
      {"name":"Lattice Burst","paused":true,"decor":false,
       "players":{"1":{"faction":"aliens"}},"map":{"width":96,"height":64},
       "units":[{"id":"warden","type":"aegis_warden","owner":1,"x":34,"y":31},
                {"id":"ally","type":"aegis_warden","owner":1,"x":44,"y":32}]}
      """
    When the commander frames (43, 31) at zoom height 45
    And the simulation advances 1600 ticks
    And the commander clicks unit "warden"
    And the commander presses "T"
    And the commander clicks a targeted point at (45, 31)
    Then the visible Lattice Burst is warning with radius 5 and 64 remaining simulation ticks
    And the battlefield is captured as "lattice-burst-warning"
    When the simulation advances 63 ticks
    Then the visible Lattice Burst is warning with radius 5 and 1 remaining simulation tick
    When the simulation advances 1 ticks
    Then the visible Lattice Burst is active with radius 5 and 128 remaining simulation ticks
    And the battlefield is captured as "lattice-burst-active"
    When the simulation advances 128 ticks
    Then the Lattice Burst display is empty
