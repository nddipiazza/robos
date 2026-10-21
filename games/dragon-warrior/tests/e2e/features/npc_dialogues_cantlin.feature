Feature: Cantlin Town NPC Dialogue Interactions
  As a Dragon Warrior player
  I want to stand in front of every NPC in Cantlin and talk to them
  So that I can verify all town NPC dialogues.

  Scenario: Talk to Weapon Dealer in Cantlin
    Given the hero is positioned at tile (23, 26) facing "up" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Weapon Dealer" containing "finest weapons in all Alefgard"

  Scenario: Talk to Armor Dealer in Cantlin
    Given the hero is positioned at tile (9, 12) facing "up" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Armor Dealer" containing "Erdrick's Shield"

  Scenario: Talk to Guard in Cantlin
    Given the hero is positioned at tile (15, 6) facing "up" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "last town before the Dragonlord's lair"

  Scenario: Talk to Villager in Cantlin
    Given the hero is positioned at tile (24, 12) facing "right" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Villager" containing "vowed to fight the Dragonlord's forces"

  Scenario: Talk to Elder in Cantlin
    Given the hero is positioned at tile (9, 20) facing "left" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Elder" containing "island to the north"

  Scenario: Talk to Wise Man in Cantlin
    Given the hero is positioned at tile (20, 19) facing "down" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Wise Man" containing "Rainbow Drop"

  Scenario: Talk to Guard Captain in Cantlin
    Given the hero is positioned at tile (27, 6) facing "right" in scene "res://scenes/Cantlin.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard Captain" containing "Cantlin's warriors stand ready"
