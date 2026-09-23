@spells @shield
Feature: Spell 04 - Shield (1st Level Abjuration)
  As an arcane spellcaster in the RobOS cRPG Realm
  I want to manifest an invisible barrier of magical force via Shield as a reaction
  So that I gain a +5 bonus to Armor Class to deflect incoming attacks

  Scenario: Reaction arcane barrier grants +5 AC deflecting heavy incoming melee strike
    Given an isolated tactical spell encounter "incoming_striker" with hero "Aeloria" class "wizard" and 20 HP
    When the hero casts spell "shield"
    Then the spell "shield" resolves successfully
    And the hero has status effect "shield"
    And the incoming attack roll of 16 is deflected by Shield with AC 17
