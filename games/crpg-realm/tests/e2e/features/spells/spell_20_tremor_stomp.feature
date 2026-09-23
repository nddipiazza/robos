@spells @tremor_stomp @martial
Feature: Spell 20 - Tremor Stomp (1st Level Martial Technique)
  As a battle-hardened fighter in the RobOS cRPG Realm
  I want to slam the ground with colossal martial force
  So that I inflict 2d8+4 bludgeoning damage and knock the target prone for melee advantage

  Scenario: Colossal martial ground slam inflicts bludgeoning damage and knocks target prone
    Given an isolated tactical spell encounter "combat_dummy" with hero "Vance" class "fighter" and 30 HP
    When the hero targets "dummy_1" and casts spell "tremor-stomp"
    Then the spell "tremor-stomp" resolves successfully
    And enemy "dummy_1" takes 6 damage
    And enemy "dummy_1" is knocked down flat on the ground
    And enemy "dummy_1" is unable to attack or move while down
    When the prone turn duration of 3.5 seconds expires
    Then enemy "dummy_1" stands back up from prone
