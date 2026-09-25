@real_crpg @scenario @dungeon @crypt
Feature: Subterranean Crypt and Archmage Reliquary Vault
  As a high-level party exploring ancient subterranean crypts
  I want our rogue to detect and disarm concealed pressure plates and flame glyphs
  And I want our cleric and wizard to purge skeletal sentinels and the armored wight lord
  So that we breach the Grand Sarcophagus and recover the fabled Crown of the Archmage

  Background:
    Given the cRPG game is running and healthy
    And an isolated leveled adventure in scene "AncientCatacombs" with party "crypt-of-the-archmage"
    Then the current scene is "AncientCatacombs"
    And the scene contains concealed traps

  Scenario: Rogue detects and disarms concealed poison dart pressure plate
    When the player enables Find Traps mode
    Then the trap "poison-dart-trap" is detected and highlighted in red
    When the player orders "Lady Elora" to disarm trap "poison-dart-trap"
    Then the trap "poison-dart-trap" is disarmed
    And the trap "poison-dart-trap" vanishes from the map after the disarm flash
    When "Lady Elora" walks straight across the neutralized trap "poison-dart-trap"
    Then the party takes no damage

  Scenario: Cleric turns undead and wizard destroys skeletal archers
    When the party approaches the western cellblock
    Then the skeleton archers draw bows on the party
    When high priestess "Faerûn" channels Turn Undead
    Then the undead sentinels are turned in divine terror
    When master "Ignis" casts spell "magic-missile" targeting the skeleton archers
    Then all 3 magic force darts strike unerringly
    And the skeleton archers are destroyed

  Scenario: Party breaches vault gate, slays Armored Wight Lord, and opens Grand Sarcophagus
    When the party opens the heavy iron crypt portcullis
    Then the armored wight lord challenges the party before the dais
    When commander "Vance" engages the wight lord with Greatsword +1
    And the combat rounds against the wight lord are executed until victory
    Then the armored wight lord falls to the stone floor
    When the player loots the Grand Sarcophagus
    Then the party acquires item "Crown of the Archmage"
    And the activity log contains message "Recovered Ancient Archmage Relic"
