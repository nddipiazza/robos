Feature: Autonomous QA Player User Simulation
  As a QA system architect
  I want an autonomous VideoGameQAPlayer to simulate real player inputs
  So that character creation, player movement, inventory management, and the first scene are verified strictly through user interactions with zero backend cheats

  Scenario: Virtual Tester completes Character Creation and Homestead via User Inputs
    Given the cRPG game is running and healthy
    When the virtual QA player types hero name "Lieutenant Vance" into the name input
    And the virtual QA player clicks the Fighter archetype button
    And the virtual QA player re-rolls ability scores for high statistics
    And the virtual QA player clicks the embark button
    Then the game naturally loads the "Homestead" scene
    When the virtual QA player advances partner Elora's dialogue to completion
    And the virtual QA player click-to-moves the hero to the footlocker chest
    And the virtual QA player clicks the footlocker chest
    Then the hero receives "service-sword" and "potion-healing"
    When the virtual QA player opens the character inventory
    And the virtual QA player uses "potion-healing" from the inventory
    And the virtual QA player closes the character inventory
    And the virtual QA player click-to-moves the hero to the front door
    And the virtual QA player clicks the front door
    Then the game naturally loads the "VillageSquare" scene
