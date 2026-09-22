@isolated @npcs @dialogue
Feature: Dozens of Unique NPCs and Rich Multi-Branch Dialogue
  As an adventurer exploring Oakhaven Village
  I want to converse with townspeople, guildmasters, innkeepers, and guards
  So that I learn realm lore and advance our quest across the realm

  Background:
    Given the cRPG game is running and healthy

  Scenario: Party Interacts With Village NPCs Across the Square
    Given the heroes have state "village square"
    And the current scene is "VillageSquare"
    When the infinity ai agent talks to NPC "npc-id-1"
    And the infinity ai agent talks to NPC "npc-id-innkeeper"
    And the infinity ai agent talks to NPC "npc-id-guildmaster"
    And the infinity ai agent talks to NPC "npc-id-herbalist"
    Then the quest stage is advanced to 3
    And the party has acquired item "garrison-key"
