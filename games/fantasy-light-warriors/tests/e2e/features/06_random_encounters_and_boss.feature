Feature: Overworld IMP Random Encounter and Garland Boss Battle
  As the 4 Light Warriors
  I want to fight an Overworld IMP encounter and defeat Garland in the Temple of Fiends inner sanctum
  So that turn-based physical attacks, Black Magic FIRE spells, EXP/Gold rewards, and boss victory triggers work

  Scenario: Defeat an IMP in combat and defeat Garland in the Temple of Fiends
    Given the game is launched on "WorldMap" at tile (37, 45) facing "up" in virtual display Xvfb
    When a random encounter with "IMP" is triggered
    Then a battle begins against "IMP"
    When the party fights until the battle is won
    And the party enters "TempleOfFiends" at tile (20, 22) facing "up"
    When the player talks to the NPC in front of the hero
    Then dialog is displayed with text containing "knock you all down"
    When the player advances the dialog page
    Then a battle begins against "GARLAND"
    When the party fights until the battle is won
    Then dialog is displayed with text containing "return to Coneria Castle"
    When the player advances the dialog page
    Then Garland is defeated and Princess Sara is rescued
