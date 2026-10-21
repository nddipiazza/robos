Feature: Kol Village NPC Dialogue Interactions
  As a Quest: Warrior Dragon player
  I want to stand in front of every NPC in Kol Village and talk to them
  So that I can verify all village NPC dialogues.

  Scenario: Talk to Elder in Kol
    Given the hero is positioned at tile (3, 2) facing "left" in scene "res://scenes/Kol.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Elder" containing "village of Kol"

  Scenario: Talk to Shopkeeper in Kol
    Given the hero is positioned at tile (10, 18) facing "up" in scene "res://scenes/Kol.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Shopkeeper" containing "East of Hauksness"

  Scenario: Talk to Wise Man in Kol
    Given the hero is positioned at tile (6, 19) facing "down" in scene "res://scenes/Kol.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Wise Man" containing "fairies know how to put Golem to sleep"

  Scenario: Talk to Villager in Kol
    Given the hero is positioned at tile (17, 14) facing "right" in scene "res://scenes/Kol.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Villager" containing "Dragonlord"

  Scenario: Talk to Soldier in Kol
    Given the hero is positioned at tile (22, 21) facing "up" in scene "res://scenes/Kol.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Soldier" containing "Nester"
