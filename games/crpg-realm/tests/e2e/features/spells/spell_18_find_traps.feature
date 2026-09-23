@spells @find_traps
Feature: Spell 18 - Find Traps (2nd Level Divination)
  As a perceptive cleric in the RobOS cRPG Realm
  I want to radiate divine divination energy across the area
  So that all concealed traps and hazards are illuminated in glowing red runes

  Scenario: Divination pulse sweeps the arena revealing concealed hazards in glowing runic aura
    Given an isolated tactical spell encounter "combat_dummy" with hero "Valen" class "cleric" and 25 HP
    When the hero casts spell "find-traps"
    Then the spell "find-traps" resolves successfully
