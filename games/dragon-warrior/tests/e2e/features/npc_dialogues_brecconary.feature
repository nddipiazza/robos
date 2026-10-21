Feature: Brecconary Town NPC Dialogue Interactions
  As a Dragon Warrior player
  I want to stand in front of every NPC in Brecconary and talk to them
  So that I can verify all town NPC dialogues.

  Scenario: Talk to Shopkeeper in Brecconary
    Given the hero is positioned at tile (18, 9) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Shopkeeper" containing "Welcome! Enter the shop"

  Scenario: Talk to Merchant in Brecconary
    Given the hero is positioned at tile (9, 23) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Merchant" containing "Poisonous Marsh"

  Scenario: Talk to Guard in Brecconary
    Given the hero is positioned at tile (15, 3) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "Brecconary"

  Scenario: Talk to Villager Lady in Brecconary
    Given the hero is positioned at tile (20, 16) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Villager" containing "No, I am not Princess Gwaelin"

  Scenario: Talk to Bridge Soldier in Brecconary
    Given the hero is positioned at tile (28, 27) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Soldier" containing "Beware the bridges"

  Scenario: Talk to Old Man in Brecconary
    Given the hero is positioned at tile (8, 29) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Old Man" containing "If thou art cursed"

  Scenario: Talk to Wise Man in Brecconary
    Given the hero is positioned at tile (22, 9) facing "up" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Wise Man" containing "magic keys can be purchased"

  Scenario: Talk to Erdrick Villager in Brecconary
    Given the hero is positioned at tile (5, 18) facing "left" in scene "res://scenes/Brecconary.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Villager" containing "descendant of Erdrick"
