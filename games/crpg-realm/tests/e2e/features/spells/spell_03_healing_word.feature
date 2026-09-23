@spells @healing_word
Feature: Spell 03 - Healing Word (1st Level Evocation)
  As a divine spellcaster in the RobOS cRPG Realm
  I want to speak a swift prayer via Healing Word as a bonus action
  So that I can deliver ranged battlefield healing up to 60 feet

  Scenario: Swift 60ft ranged bonus action triage prayer on injured ally
    Given an isolated tactical spell encounter "combat_dummy" with hero "Valen" class "cleric" and 12 HP
    When the hero casts spell "healing-word"
    Then the spell "healing-word" resolves successfully
    And the ally "Valen" regains 3 Hit Points
