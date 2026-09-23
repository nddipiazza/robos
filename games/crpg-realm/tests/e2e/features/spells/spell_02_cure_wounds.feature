@spells @cure_wounds
Feature: Spell 02 - Cure Wounds (1st Level Evocation)
  As a divine spellcaster in the RobOS cRPG Realm
  I want to channel radiant life energy via Cure Wounds
  So that I can heal critical wounds and revive fallen allies from unconsciousness

  Scenario: Touch range holy restorative triage on wounded cleric ally
    Given an isolated tactical spell encounter "combat_dummy" with hero "Valen" class "cleric" and 10 HP
    When the hero casts spell "cure-wounds"
    Then the spell "cure-wounds" resolves successfully
    And the ally "Valen" regains 4 Hit Points

  Scenario: Emergency battlefield revival restoring fallen ally from 0 HP
    Given an isolated tactical spell encounter "combat_dummy" with hero "Valen" class "cleric" and 25 HP
    When ally "Elora" is reduced to 0 Hit Points and falls unconscious
    And the hero targets "Elora" and casts spell "cure-wounds"
    Then the spell "cure-wounds" resolves successfully
    And the ally "Elora" regains 5 Hit Points
    And "Elora" is no longer afflicted with "unconscious"
