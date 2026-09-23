@spells @burning_hands
Feature: Spell 07 - Burning Hands (1st Level Evocation)
  As an evocation caster in the RobOS cRPG Realm
  I want to unleash a 15-foot cone of roaring fire
  So that I can inflict 3d6 fire damage on charging enemy packs

  Scenario: 15ft cone of roaring fire incinerates charging dire wolf pack
    Given an isolated tactical spell encounter "charging_pack" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "burning-hands" at (1140, 500)
    Then the spell "burning-hands" resolves successfully
    And enemy "wolf_1" takes 5 damage
