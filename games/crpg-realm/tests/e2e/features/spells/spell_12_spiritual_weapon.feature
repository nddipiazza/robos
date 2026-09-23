@spells @spiritual_weapon
Feature: Spell 12 - Spiritual Weapon (2nd Level Evocation)
  As a battle-tested cleric in the RobOS cRPG Realm
  I want to manifest a floating luminous spectral warhammer as a bonus action
  So that I can deliver 1d8 plus Wisdom force damage to targeted foes

  Scenario: Spectral luminous warhammer strikes target for 1d8+WIS force damage
    Given an isolated tactical spell encounter "combat_dummy" with hero "Valen" class "cleric" and 25 HP
    When the hero targets "dummy_1" and casts spell "spiritual-weapon"
    Then the spell "spiritual-weapon" resolves successfully
    And enemy "dummy_1" takes 2 damage
