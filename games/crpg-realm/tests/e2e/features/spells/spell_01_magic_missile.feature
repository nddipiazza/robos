@spells @magic_missile
Feature: Spell 01 - Magic Missile (1st Level Evocation)
  As an arcane spellcaster in the RobOS cRPG Realm
  I want to cast Magic Missile to unleash unerring force darts
  So that I can bypass high Armor Class enemies and guarantee tactical damage

  Scenario: Unerring force darts strike high-AC evasive scout bypassing defenses
    Given an isolated tactical spell encounter "evasion_scout" with hero "Aeloria" class "wizard" and 25 HP
    When the hero targets "scout_1" and casts spell "magic-missile"
    Then the spell "magic-missile" resolves successfully
    And enemy "scout_1" takes 6 damage

  Scenario: Arcane Shield completely negates and absorbs Magic Missile barrage
    Given an isolated tactical spell encounter "evasion_scout" with hero "Aeloria" class "wizard" and 25 HP
    When target "scout_1" is protected by "shield"
    And the hero targets "scout_1" and casts spell "magic-missile"
    Then the spell "magic-missile" resolves successfully
    And the magic missiles are completely absorbed by Shield with 0 damage
