@isolated @pathfinding
Feature: House and Wall Collision Avoidance and Door Navigation
  As an Infinity Engine player
  I want the party to smoothly navigate around houses, walls, and doorways
  So that heroes reach target doors and pick up items without getting stuck on obstacles

  Background:
    Given the cRPG game is running and healthy

  Scenario: Party Navigates Around Houses and Walls to Reach Doors and Items
    Given the heroes have state "village square"
    And the current scene is "VillageSquare"
    When the infinity ai engine handles the enemy encounters as they come
    And the infinity ai agent moves to "door-id-inn"
    And the infinity ai agent moves to the door "door-id-1"
    And the infinity ai agent picks up item "item-id-1"
    Then the party has acquired item "item-id-1"
