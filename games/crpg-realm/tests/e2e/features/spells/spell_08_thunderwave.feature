@spells @thunderwave
Feature: Spell 08 - Thunderwave (1st Level Evocation)
  As an evoker in the RobOS cRPG Realm
  I want to detonate a 15-foot cube of concussive acoustic shockwave
  So that I inflict 2d8 thunder damage and push nearby enemies back 10 feet

  Scenario: 15ft cube concussive shockwave unleashes 2d8 thunder damage and 10ft pushback
    Given an isolated tactical spell encounter "charging_pack" with hero "Aeloria" class "wizard" and 25 HP
    When the hero casts spell "thunderwave" at (1140, 500)
    Then the spell "thunderwave" resolves successfully
    And enemy "wolf_1" takes 4 damage
