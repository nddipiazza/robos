@spells @haste
Feature: Spell 15 - Haste (3rd Level Transmutation)
  As a transmutation master in the RobOS cRPG Realm
  I want to surge target ally with blinding quickness
  So that they gain +2 AC, double movement velocity, and extra combat actions

  Scenario: Transmutation speed surge bestows +2 AC, double movement, and extra action
    Given an isolated tactical spell encounter "combat_dummy" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "haste"
    Then the spell "haste" resolves successfully
    And the hero has status effect "hasted"
