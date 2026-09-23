@spells @knock
Feature: Spell 19 - Knock (2nd Level Transmutation)
  As a versatile spellcaster in the RobOS cRPG Realm
  I want to channel acoustic resonant shockwaves via Knock
  So that I can unlatch secured locks and suppress dungeon barriers

  Scenario: Resonant acoustic chime vibrates through dungeon barriers unlocking mechanisms
    Given an isolated tactical spell encounter "combat_dummy" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "knock"
    Then the spell "knock" resolves successfully
