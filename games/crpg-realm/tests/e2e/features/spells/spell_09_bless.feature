@spells @bless
Feature: Spell 09 - Bless (1st Level Enchantment)
  As a cleric of the holy light in the RobOS cRPG Realm
  I want to bestow a divine blessing upon up to three party allies
  So that they each add +1d4 to all attack rolls and saving throws

  Scenario: Divine enchantment empowers party with +1d4 to attack rolls and saving throws
    Given an isolated tactical spell encounter "combat_dummy" with hero "Valen" class "cleric" and 25 HP
    When the hero casts spell "bless"
    Then the spell "bless" resolves successfully
    And allies "Valen", "Elora", and "Thrumbar" have status effect "blessed"
