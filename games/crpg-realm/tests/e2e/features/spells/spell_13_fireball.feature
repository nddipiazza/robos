@spells @fireball
Feature: Spell 13 - Fireball (3rd Level Evocation)
  As a master evoker in the RobOS cRPG Realm
  I want to detonate an 8d6 fire blast across a 20ft radius sphere
  So that I can decimate tightly clustered hordes of goblin skirmishers

  Scenario: Classic 20ft radius fireball explosion incinerates goblin crowd
    Given an isolated tactical spell encounter "goblin_crowd" with hero "Ignis" class "wizard" and 35 HP
    When the hero casts spell "fireball" at (1150, 520)
    Then the spell "fireball" resolves successfully
    And enemy "goblin_1" takes lethal damage and is defeated
