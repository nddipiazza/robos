@phase_barrier
Feature: Concord Wardens can seal a crossing for a limited time
  Scenario: A real hotkey cast shows the field radius and remaining time
    Given an RTS test scenario
      """
      {"name":"Phase Barrier","paused":true,"decor":false,
       "players":{"1":{"faction":"aliens"}},"map":{"width":96,"height":64},
       "units":[{"id":"warden","type":"aegis_warden","owner":1,"x":34,"y":31}]}
      """
    When the commander frames (43, 31) at zoom height 45
    And the commander clicks unit "warden"
    And the commander presses "F"
    And the commander clicks a targeted point at (45, 31)
    Then the visible Phase Barrier has radius 3 and 512 ticks remaining
    And the battlefield is captured as "phase-barrier-active"
    When the simulation advances 256 ticks
    Then the visible Phase Barrier has radius 3 and 256 ticks remaining
    When the simulation advances 256 ticks
    Then the Phase Barrier display is empty
