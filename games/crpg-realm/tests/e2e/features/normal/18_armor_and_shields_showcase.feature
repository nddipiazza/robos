@normal @equipment @armor @shields @dnd5e
Feature: 3D Miniature Equipment Slots, Armor Class Recalculation, and Shield Deflection
  As a player equipping weapons, body armors, shields, and helmets in the RobOS cRPG Realm
  I want armor and shield equipment slots to follow authentic D&D 5th Edition AC formulas
  And I want shields and body armors to attach to 3D miniature sockets and deflect enemy attacks
  So that character defense visually and mechanically reflects my equipped loadout

  Scenario: Hero equips shields, helmets, and armors with authentic D&D 5e AC recalculation
    Given the cRPG game is running and healthy
    And an isolated test starting in scene "Homestead" with party "Lieutenant Vance" the "fighter"
    When the hero ability score "DEX" is set to 14
    And the hero unequips item slot "shield"
    And the hero equips item "leather-armor"
    Then the hero has item "leather-armor" equipped
    And the hero equipped armor is "leather-armor"
    And the hero equipped shield is ""
    And the hero armor class is 13

    When the hero equips item "shield"
    Then the hero has item "shield" equipped
    And the hero equipped shield is "shield"
    And the hero armor class is 15

    When the hero equips item "chain-mail"
    Then the hero has item "chain-mail" equipped
    And the hero equipped armor is "chain-mail"
    And the hero equipped shield is "shield"
    And the hero armor class is 18

    When the hero equips item "plate-armor"
    And the hero equips item "tower-shield"
    And the hero equips item "helm-knight"
    Then the hero has item "plate-armor" equipped
    And the hero has item "tower-shield" equipped
    And the hero has item "helm-knight" equipped
    And the hero equipped armor is "plate-armor"
    And the hero equipped shield is "tower-shield"
    And the hero equipped helmet is "helm-knight"
    And the hero armor class is 20

    When the hero unequips item slot "shield"
    Then the hero equipped shield is ""
    And the hero armor class is 18

    When the hero unequips item slot "armor"
    Then the hero equipped armor is ""
    And the hero armor class is 12
