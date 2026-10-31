@pioneer_repair
Feature: Pioneers repair damaged friendly machines with paid work
  Healing uses construction speed. A full health bar costs 25% of the target's
  crystal and aether price, with shared cumulative rounding across workers.

  Scenario: Right-click repairs a damaged mechanical unit
    Given the paused Pioneer repair fixture with 100 crystal and 100 aether
    When the Pioneer right-clicks the damaged Howitzer
    Then one second restores exactly 5.46875 HP and spends 2 crystal and 1 aether
    And completing the repair restores 140 HP for exactly 30 crystal and 25 aether

  Scenario: Halt stops healing and resource spending
    Given the paused Pioneer repair fixture with 100 crystal and 100 aether
    When the Pioneer right-clicks the damaged Howitzer
    Then one second restores exactly 5.46875 HP and spends 2 crystal and 1 aether
    When the player presses Halt and five seconds pass
    Then the Howitzer stays at 40.46875 HP and the resource balances stay at 98 and 99

  Scenario: Repair hotkey and Shift follow-up work on structures
    Given the paused Pioneer repair fixture with 100 crystal and 100 aether
    When the player uses E on the damaged Silo and Shift-right-clicks a destination
    Then the Silo reaches 400 HP for 13 crystal and the Pioneer follows the queued move

  Scenario: Repair takes precedence over the gas vent underneath a damaged Tap
    Given the paused Pioneer repair fixture with 100 crystal and 100 aether
    When the Pioneer right-clicks the damaged Aether Tap
    Then the Tap reaches 500 HP for 10 crystal and zero aether
    And right-clicking the healthy Tap orders gas gathering
