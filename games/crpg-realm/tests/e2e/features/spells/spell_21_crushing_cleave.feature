@spells @crushing_cleave @martial
Feature: Spell 21 - Crushing Cleave (1st Level Martial Technique)
  As a greatsword warrior in the RobOS cRPG Realm
  I want to execute an overwhelming two-handed sweeping arc
  So that I deliver +2d10+6 crushing slashing damage to cleave through armor

  Scenario: Overpowering two-handed greatsword sweep deals bonus crushing slashing damage
    Given an isolated tactical spell encounter "combat_dummy" with hero "Vance" class "fighter" and 30 HP
    When the hero targets "dummy_1" and casts spell "crushing-cleave"
    Then the spell "crushing-cleave" resolves successfully
    And enemy "dummy_1" takes 8 damage
