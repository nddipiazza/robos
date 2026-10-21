Feature: Rimuldar Town NPC Dialogue Interactions
  As a Dragon Warrior player
  I want to stand in front of every NPC in Rimuldar and talk to them
  So that I can verify all town NPC dialogues.

  Scenario: Talk to Key Merchant in Rimuldar
    Given the hero is positioned at tile (28, 13) facing "up" in scene "res://scenes/Rimuldar.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Key Merchant" containing "Magic Keys unlock any door"

  Scenario: Talk to Weapon Dealer in Rimuldar
    Given the hero is positioned at tile (12, 23) facing "up" in scene "res://scenes/Rimuldar.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Weapon Dealer" containing "warrior without a good sword"

  Scenario: Talk to Guard in Rimuldar
    Given the hero is positioned at tile (15, 6) facing "up" in scene "res://scenes/Rimuldar.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "Rimuldar is the only place"

  Scenario: Talk to Villager in Rimuldar
    Given the hero is positioned at tile (21, 15) facing "right" in scene "res://scenes/Rimuldar.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Villager" containing "swamps to the north"

  Scenario: Talk to Elder in Rimuldar
    Given the hero is positioned at tile (8, 27) facing "down" in scene "res://scenes/Rimuldar.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Elder" containing "Golem blocks the path to Cantlin"

  Scenario: Talk to Wise Man in Rimuldar
    Given the hero is positioned at tile (26, 26) facing "up" in scene "res://scenes/Rimuldar.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Wise Man" containing "Stones of Sunlight"
