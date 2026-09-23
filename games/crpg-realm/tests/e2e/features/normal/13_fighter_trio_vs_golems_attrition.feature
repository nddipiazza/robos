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
    When hero "Commander Vance" approaches and unleashes fighter ability "tremor-stomp" on enemy "golem_alpha"
    Then the hero physically moves into melee range before striking
    And enemy "golem_alpha" is knocked prone granting advantage
    And the activity log contains message "TREMOR STOMP"
    And enemy "golem_alpha" target is "Commander Vance"
    And linked pack friend "golem_beta" also auto-aggravates on "Commander Vance"
    And linked pack friend "golem_gamma" also auto-aggravates on "Commander Vance"
    When companion "Sergeant Garrick" approaches and unleashes fighter ability "crushing-cleave" on enemy "golem_beta"
    Then companion "Sergeant Garrick" physically moves into melee range before striking
    And the activity log contains message "CRUSHING CLEAVE"
    And enemy "golem_beta" target is "Sergeant Garrick"
    When companion "Corporal Brutus" unleashes fighter ability "rallying-stomp"
    Then the activity log contains message "RALLYING STOMP"
    When combat round 1 is fought between the golems and the fighters
    Then the combat telemetry records hooked round 1 events
    And each golem strike deals between 4 and 8 damage on hit
    And the hero fighters lose the exact amount of health matching the recorded damage
    When combat rounds are fought until party health drops below 55 HP
    Then the autonomous party AI automatically administers healing potions from their toolbelts
    And the hooked round events verify the health restoration and potion consumption
    And all 3 hero fighters are still alive and healthy
    And none of the hero fighters have fallen or been defeated
