@spells @sleep
Feature: Spell 05 - Sleep (1st Level Enchantment)
  As an enchantment specialist in the RobOS cRPG Realm
  I want to roll a 5d8 HP pool of magical slumber
  So that low-HP minions succumb in ascending order while high-HP bosses resist

  Scenario: 5d8 HP slumber pool puts low-HP minions to sleep while high-HP boss resists
    Given an isolated tactical spell encounter "boss_and_minions" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "sleep" at (1100, 520)
    Then the spell "sleep" resolves successfully
    And enemy "minion_1" has status effect "asleep"
    And enemy "ogre_boss" resisted the spell
