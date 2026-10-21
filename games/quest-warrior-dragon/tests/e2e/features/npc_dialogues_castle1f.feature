Feature: Tantegel Castle 1F NPC Dialogue Interactions
  As a Quest: Warrior Dragon player
  I want to stand in front of every NPC in Tantegel Castle 1F and talk to them
  So that I can verify all castle NPC dialogues and tablet inscriptions.

  Scenario: Talk to Minister in Tantegel Castle 1F
    Given the hero is positioned at tile (9, 8) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Minister" containing "Many brave adventurers have left this castle"

  Scenario: Talk to Sage in Tantegel Castle 1F
    Given the hero is positioned at tile (16, 22) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Sage" containing "Princess Gwaelin was kidnapped"

  Scenario: Talk to Wise Man in Tantegel Castle 1F
    Given the hero is positioned at tile (21, 28) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Wise Man" containing "descendant of Erdrick"

  Scenario: Talk to Throne Room Guard in Tantegel Castle 1F
    Given the hero is positioned at tile (10, 29) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "Throne Room where King Lorik awaits"

  Scenario: Talk to Treasury Guard in Tantegel Castle 1F
    Given the hero is positioned at tile (13, 29) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "treasury lies beyond these doors"

  Scenario: Talk to Gate Guard in Tantegel Castle 1F
    Given the hero is positioned at tile (9, 10) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Guard" containing "king's leave"

  Scenario: Talk to Attendant in Tantegel Castle 1F
    Given the hero is positioned at tile (3, 10) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Attendant" containing "king awaits you in the throne room"

  Scenario: Examine Stone Inscription Tablet in Tantegel Castle 1F
    Given the hero is positioned at tile (20, 28) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "" containing "Hero's coming was foretold"

  Scenario: Talk to Key Shop Merchant in Tantegel Castle 1F
    Given the hero is positioned at tile (25, 4) facing "up" in scene "res://scenes/Castle1F.tscn"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "Shopkeeper" containing "WHAT DOST THOU WANT?"
