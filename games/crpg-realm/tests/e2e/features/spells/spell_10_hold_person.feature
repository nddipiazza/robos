@spells @hold_person
Feature: Spell 10 - Hold Person (2nd Level Enchantment)
  As an enchanter in the RobOS cRPG Realm
  I want to bind a humanoid target in magical amber chains
  So that they are paralyzed for automatic critical hits, while non-humanoids are immune

  Scenario: Amber binding chains paralyze humanoid bandit on failed Wisdom save
    Given an isolated tactical spell encounter "humanoid_and_beast" with hero "Valen" class "cleric" and 25 HP
    When the hero targets "bandit_1" and casts spell "hold-person"
    Then the spell "hold-person" resolves successfully
    And enemy "bandit_1" has status effect "paralyzed"

  Scenario: Non-humanoid beast immunity: Hold Person fails immediately against trained war hound
    Given an isolated tactical spell encounter "humanoid_and_beast" with hero "Valen" class "cleric" and 25 HP
    When the hero targets "war_hound" and casts spell "hold-person"
    Then enemy "war_hound" resisted the spell
