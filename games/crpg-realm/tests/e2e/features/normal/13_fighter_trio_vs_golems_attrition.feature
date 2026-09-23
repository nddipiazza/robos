Feature: 3 Hero Fighters with 50 Potions Each vs 3 500 HP Golems
  As a tactical adventuring party of three veteran fighters
  I want to face three massive ancient stone golems in an attrition encounter
  So that our martial special maneuvers and autonomous party AI healing ensure none of the heroes fall in battle

  Background:
    Given the cRPG game is running and healthy
    And an isolated golem attrition battle with 3 fighters of 100 HP each and 3 golems of 500 HP each
    Then the current scene is "TacticalBattle"
    And the tactical battle contains 3 enemies with 500 HP each
    And each of the 3 hero fighters has 100 HP and 50 healing potions

  Scenario: 3 Hero Fighters withstand 3 Golems through martial abilities and autonomous AI healing
    When hero "Commander Vance" unleashes fighter ability "tremor-stomp" on enemy "golem_alpha"
    Then enemy "golem_alpha" is knocked prone granting advantage
    And the activity log contains message "TREMOR STOMP"
    When companion "Sergeant Garrick" unleashes fighter ability "crushing-cleave" on enemy "golem_beta"
    Then the activity log contains message "CRUSHING CLEAVE"
    When companion "Corporal Brutus" unleashes fighter ability "rallying-stomp"
    Then the activity log contains message "RALLYING STOMP"
    When the 3 golems attack the fighter party across multiple combat rounds
    Then the party fighters suffer damage from the golems
    When the autonomous party AI monitors party member health
    Then the autonomous party AI automatically administers healing potions from their toolbelts
    And the activity log contains message "AI HEAL"
    And all 3 hero fighters are still alive and healthy
    And none of the hero fighters have fallen or been defeated
