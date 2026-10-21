Feature: Garinham Town NPC Dialogue Interactions
  As a Dragon Warrior player
  I want to stand in front of every NPC in Garinham and talk to them
  So that I can verify all town NPC dialogues.

  Scenario: Talk to Minstrel Shopkeeper in Garinham
    Given the hero is positioned at tile (13, 9) facing "up" in scene "res://scenes/Garinham.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Shopkeeper" containing "Garin, a wandering minstrel"

  Scenario: Talk to Elder in Garinham
    Given the hero is positioned at tile (5, 5) facing "left" in scene "res://scenes/Garinham.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Elder" containing "Princess Gwaelin is hidden away in a cave"

  Scenario: Talk to Soldier in Garinham
    Given the hero is positioned at tile (10, 13) facing "up" in scene "res://scenes/Garinham.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Soldier" containing "Nester"

  Scenario: Talk to Villager in Garinham
    Given the hero is positioned at tile (15, 10) facing "right" in scene "res://scenes/Garinham.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Villager" containing "kidnapped and taken eastward"

  Scenario: Talk to Guard in Garinham
    Given the hero is positioned at tile (17, 18) facing "up" in scene "res://scenes/Garinham.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "Garin's Grave lies to the east"
