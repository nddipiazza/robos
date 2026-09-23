@spells @counterspell
Feature: Spell 16 - Counterspell (3rd Level Abjuration)
  As an abjuration specialist in the RobOS cRPG Realm
  I want to disrupt an enemy spellcaster in the process of casting
  So that their spell fizzles and collapses harmlessly into sparks

  Scenario: Instant reaction dispels and collapses enemy cultist spell weave into sparks
    Given an isolated tactical spell encounter "dueling_caster" with hero "Aeloria" class "wizard" and 30 HP
    When the hero targets "enemy_mage" and casts spell "counterspell"
    Then the spell "counterspell" resolves successfully
    And enemy spell was interrupted and neutralized by Counterspell
