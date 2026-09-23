@spells @rallying_stomp @martial
Feature: Spell 22 - Rallying Stomp (1st Level Martial Technique)
  As an inspiring commander in the RobOS cRPG Realm
  I want to perform an inspiring war stomp and battle cry
  So that I restore 2d6+4 HP to all party members and grant +2 AC defensive posture

  Scenario: Inspiring war stomp restores HP to party members and grants +2 AC posture
    Given an isolated tactical spell encounter "combat_dummy" with hero "Vance" class "fighter" and 30 HP
    When the hero casts spell "rallying-stomp"
    Then the spell "rallying-stomp" resolves successfully
