@full_playthrough @epic_campaign
Feature: Expanded Epic Campaign Full Playthrough
  As an Infinity Engine player
  I want the Infinity AI Agent to autonomously quest through the entire expanded realm
  From character creation through Homestead, Village Square, Whispering Forest, and Keep to achieve Victory

  Background:
    Given the cRPG game is running and healthy

  Scenario: Autonomous Infinity AI Agent Embarks and Vanquishes Malakor in Epic Campaign
    When the infinity ai agent creates a character with race "human" and class "fighter" named "Sir Donald"
    And the current scene is "Homestead"
    And the infinity ai agent quests through Homestead from awakening to the village portal
    And the current scene is "VillageSquare"
    And the infinity ai engine handles the enemy encounters as they come
    And the infinity ai agent talks to NPC "npc-id-1"
    And the infinity ai agent picks up item "item-id-1"
    And the infinity ai agent moves to the door "door-id-1"
    And the infinity ai agent enters door "door-id-1"
    And the current scene is "GarrisonKeep"
    And the infinity ai agent infiltrates the Garrison Keep and defeats Captain Malakor
    Then the victory screen is visible
