@shift_commands
Feature: Shift commands preserve the player's intent
  Queue finite jobs in order, let gathering yield after delivery, and keep selection modifiers distinct.

  Scenario: A group constructs three halls then returns to crystal
    Given the three-worker Shift construction scenario
    When the workers queue three halls followed by crystal gathering
    Then three paid halls finish within 110 seconds and all builders deliver new income

  Scenario: Cancel construction through its active worker
    Given the three-worker Shift construction scenario
    When one worker starts a paid hall and cancels it
    Then the foundation is removed and exactly 112 crystal is refunded once

  Scenario: Queued ground orders preserve their waypoints
    Given one Rifleman with two waypoints and a final attack-move
    When the queued movement runs for 15 seconds
    Then both waypoints are visited before the final destination

  Scenario: Queued enemy targets are attacked in order
    Given a Rifleman with two queued enemy targets
    When the queued attacks run for 35 seconds
    Then the second enemy stays unharmed until the first dies and both enemies are defeated

  Scenario: Shift-click adds and removes units from selection
    Given two nearby owned Riflemen
    When the second Rifleman is Shift-clicked twice
    Then the selection first contains both units and then only the original

  Scenario: Shift-click production queues a paid batch
    Given a supplied Muster Hall with 500 crystal
    When its Rifleman button is Shift-clicked
    Then five Riflemen are queued and exactly 250 crystal is spent

  Scenario: Shift-recalling a control group adds it to the selection
    Given two nearby owned Riflemen
    When the first Rifleman is assigned to group 1 and recalled with Shift onto the second
    Then both Riflemen are selected

  Scenario: Shift-right-click on the minimap appends a waypoint
    Given one Rifleman with two waypoints and a final attack-move
    When another ground destination is Shift-right-clicked on the minimap
    Then the original three orders remain ahead of the new move
