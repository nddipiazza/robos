@spells @invisibility
Feature: Spell 11 - Invisibility (2nd Level Illusion)
  As an illusionist in the RobOS cRPG Realm
  I want to bend light around a touched creature
  So that they become invisible and can slip past hostile sentries unseen

  Scenario: Arcane cloaking renders caster invisible to evade enemy detection
    Given an isolated tactical spell encounter "combat_dummy" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "invisibility"
    Then the spell "invisibility" resolves successfully
    And the hero has status effect "invisible"
