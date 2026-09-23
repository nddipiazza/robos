@spells @lightning_bolt
Feature: Spell 14 - Lightning Bolt (3rd Level Evocation)
  As an evoker in the RobOS cRPG Realm
  I want to discharge a 100-foot linear piercing stroke of crackling electricity
  So that I can tear through enemies standing in corridor columns

  Scenario: 100ft linear piercing stroke of crackling electricity tears through corridor guards
    Given an isolated tactical spell encounter "corridor_column" with hero "Aeloria" class "wizard" and 30 HP
    When the hero casts spell "lightning-bolt" at (1250, 520)
    Then the spell "lightning-bolt" resolves successfully
    And enemy "corridor_1" takes 10 damage
    And enemy "corridor_2" takes 10 damage
