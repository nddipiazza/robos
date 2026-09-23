@spells @dispel_magic
Feature: Spell 17 - Dispel Magic (3rd Level Abjuration)
  As an abjuration master in the RobOS cRPG Realm
  I want to break and strip magical enchantments from a target
  So that enemy buffs and lingering enchantments are eradicated

  Scenario: Prismatic purge strips active mage armor and returns AC to baseline
    Given an isolated tactical spell encounter "combat_dummy" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "mage-armor"
    And the hero casts spell "dispel-magic"
    Then the spell "dispel-magic" resolves successfully
    And the status effect "mage_armor" on "Aeloria" was dispelled
