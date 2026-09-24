@spells @magic_missile
Feature: Spell 01 - Magic Missile (1st Level Evocation)
  As an arcane spellcaster in the RobOS cRPG Realm
  I want to cast Magic Missile to unleash unerring force darts
  So that I can bypass high Armor Class enemies and guarantee tactical damage

  Scenario: Unerring force darts strike high-AC evasive scout bypassing defenses
    5e SRD: three glowing darts, each 1d4+1 force damage, automatically hit — AC 18 is irrelevant.
    Every dart impact, the damage and its timing are read back from the engine event journal.
    Given an isolated tactical spell encounter "evasion_scout" with hero "Aeloria" class "wizard" and 25 HP
    When the hero targets "scout_1" and casts spell "magic-missile" with proof capture
    Then the spell "magic-missile" resolves successfully
    And 3 unerring force darts struck "scout_1"
    And the damage landed the instant the last dart hit
    And enemy "scout_1" lost exactly the sum of the darts
    And enemy "scout_1" takes 6 damage

  Scenario: Arcane Shield completely negates and absorbs Magic Missile barrage
    Given an isolated tactical spell encounter "evasion_scout" with hero "Aeloria" class "wizard" and 25 HP
    When target "scout_1" is protected by "shield"
    And the hero targets "scout_1" and casts spell "magic-missile" with proof capture
    Then the spell "magic-missile" resolves successfully
    And the magic missiles are completely absorbed by Shield with 0 damage
    And all 3 darts splashed off the Shield ward and "scout_1" kept every hit point
