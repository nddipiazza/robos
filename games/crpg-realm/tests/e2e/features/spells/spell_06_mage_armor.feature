@spells @mage_armor
Feature: Spell 06 - Mage Armor (1st Level Abjuration)
  As an unarmored wizard in the RobOS cRPG Realm
  I want to touch a willing creature to weave protective abjuration energy
  So that their base Armor Class becomes 13 plus their Dexterity modifier

  Scenario: Diamond-lattice protective ward sets unarmored wizard base AC to 13 + DEX
    Given an isolated tactical spell encounter "combat_dummy" with hero "Aeloria" class "wizard" and 20 HP
    When the hero casts spell "mage-armor"
    Then the spell "mage-armor" resolves successfully
    And the hero has Armor Class 15
    And the hero has status effect "mage_armor"
