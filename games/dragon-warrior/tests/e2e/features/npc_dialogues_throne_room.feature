Feature: Throne Room NPC Dialogue & Multi-State Interactions
  As a Dragon Warrior player
  I want to stand in front of King Lorik in the Throne Room
  So that I can verify every NPC dialogue state and quest condition.

  Scenario: Talk to King Lorik — State 1: New Game Quest Intro
    Given the game is launched into scene "res://scenes/ThroneRoom.tscn" at tile (4, 5) facing "up"
    And the King Lorik intro state is set to "false"
    Then dialog is displayed with speaker "King Lorik" containing "descendant of Erdrick"

  Scenario: Talk to King Lorik — State 2: Returning / Save Progress Check
    Given the game is launched into scene "res://scenes/ThroneRoom.tscn" at tile (4, 5) facing "up"
    And the King Lorik intro state is set to "true"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "King Lorik" containing "pleased that thou hast returned"

  Scenario: Talk to King Lorik — State 3: Highest Experience Level Setup
    Given the game is launched into scene "res://scenes/ThroneRoom.tscn" at tile (4, 5) facing "up"
    And the King Lorik intro state is set to "true"
    And the game state variable "hero_level" is set to "30"
    When the hero talks to the NPC in front
    Then dialog is displayed with speaker "King Lorik" containing "highest level"
