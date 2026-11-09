Feature: Coneria Shops (Weapon, Armor, White Magic, Black Magic, Item) and Coneria Inn
  As a party preparing for the Temple of Fiends
  I want to enter every shop and the Inn in Coneria, see the NES shop interior screen, buy our merchandise, and exit back onto the street
  So that our party has Rapier, Chain Mail, CURE, FIRE, and full HP without getting stuck on a shop door

  Scenario: Visit Coneria Weapon Shop, Armor Shop, White Magic Shop, Black Magic Shop, Inn, and Item Shop
    Given the game is launched on "Coneria" at tile (11, 11) facing "up" in virtual display Xvfb
    When the hero moves up 1 tiles
    Then the NES shop screen "WEAPON" is displayed with cursor on "Buy"
    And dialog is displayed with text containing "Coneria Weapon Shop"
    When the player buys the merchandise and exits the shop
    Then the hero is at tile (11, 11)
    And the leader weapon is "Rapier" and attack is 19
    And the game flag "bought_weapon_coneria" is true
    When the party teleports to tile (6, 11) facing "up"
    And the hero moves up 1 tiles
    Then the NES shop screen "ARMOR" is displayed with cursor on "Buy"
    And dialog is displayed with text containing "Coneria Armor Shop"
    When the player buys the merchandise and exits the shop
    Then the hero is at tile (6, 11)
    And the leader armor is "Chain Mail" and defense is 15
    And the game flag "bought_armor_coneria" is true
    When the party teleports to tile (7, 5) facing "up"
    And the hero moves up 1 tiles
    Then the NES shop screen "WHITE" is displayed with cursor on "Buy"
    And dialog is displayed with text containing "White Magic Shop"
    When the player buys the merchandise and exits the shop
    Then the hero is at tile (7, 5)
    And the party knows spell "CURE"
    And the game flag "bought_white_magic_coneria" is true
    When the party teleports to tile (3, 5) facing "up"
    And the hero moves up 1 tiles
    Then the NES shop screen "BLACK" is displayed with cursor on "Buy"
    And dialog is displayed with text containing "Black Magic Shop"
    When the player buys the merchandise and exits the shop
    Then the hero is at tile (3, 5)
    And the party knows spell "FIRE"
    And the game flag "bought_black_magic_coneria" is true
    When the party teleports to tile (11, 19) facing "up"
    And the hero moves up 1 tiles
    Then the NES shop screen "INN" is displayed with cursor on "Buy"
    And dialog is displayed with text containing "Coneria Inn"
    When the player buys the merchandise and exits the shop
    Then the hero is at tile (11, 19)
    And the game flag "used_inn_coneria" is true
    When the party teleports to tile (27, 11) facing "up"
    And the hero moves up 1 tiles
    Then the NES shop screen "ITEM" is displayed with cursor on "Buy"
    And dialog is displayed with text containing "Coneria Item Shop"
    When the player buys the merchandise and exits the shop
    Then the hero is at tile (27, 11)
    And the item "HEAL Potion" is present in player inventory
