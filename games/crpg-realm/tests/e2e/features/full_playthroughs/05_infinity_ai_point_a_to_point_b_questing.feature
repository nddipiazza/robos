@full_playthrough
Feature: Infinity AI Autonomous Questing from Point A to Point B
  As the Infinity AI Agent operating with human-like game mastery
  I want to autonomously create a character, navigate from Homestead to Village Square, defeat the shadow hound, and infiltrate the Garrison Keep
  So that the entire campaign slice is quested and completed from Point A to Point B through intelligent player intentions

  Scenario: Infinity AI Agent quests through the entire campaign slice from Point A to Point B
    Given the cRPG game is running and healthy
    When the infinity ai agent creates a character with race "human" and class "fighter" named "Lieutenant Vance"
    Then the current scene is "Homestead"
    When the infinity ai agent quests through Homestead from awakening to the village portal
    Then the current scene is "VillageSquare"
    When the infinity ai agent quests through Oakhaven Village Square and unlocks the garrison gate
    Then the current scene is "GarrisonKeep"
    When the infinity ai agent infiltrates the Garrison Keep and defeats Captain Malakor
    Then the victory screen is visible

  Scenario: Infinity AI Agent executes uninterrupted full campaign playthrough from start to finish
    Given the cRPG game is running and healthy
    When the infinity ai agent plays through the full campaign journey as "elf" "wizard" named "Aeloria" with spells "magic-missile,fireball"
    Then the victory screen is visible
