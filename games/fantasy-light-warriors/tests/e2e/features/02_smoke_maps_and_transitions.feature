Feature: Map Loading, Exits, Overworld Entrances, and Castle Stairs
  As a player exploring the Coneria region
  I want town exits, overworld entrances, castle stairs, and dungeon entrances to transition cleanly without looping
  So that the party can walk between Coneria, the Overworld, Coneria Castle 1F/2F, and the Temple of Fiends

  Scenario: Walk out of Coneria onto the Overworld, enter Coneria Castle 1F, and climb to 2F
    Given the game is launched on "Coneria" at tile (16, 21) facing "down" in virtual display Xvfb
    When the hero moves down 3 tiles
    Then the game transitions to "WorldMap"
    And the hero is at tile (41, 50)
    When the hero moves up 3 tiles
    Then the game transitions to "ConeriaCastle1F"
    And the hero is at tile (12, 35)
    When the party teleports to tile (12, 20) facing "up"
    And the hero moves up 2 tiles
    Then the game transitions to "ConeriaCastle2F"
    And the hero is at tile (12, 17)
    When the hero moves down 1 tiles
    Then the game transitions to "ConeriaCastle1F"
    And the hero is at tile (12, 19)

  Scenario: Enter Temple of Fiends from the Overworld and exit back to the Overworld
    Given the game is launched on "WorldMap" at tile (18, 12) facing "up" in virtual display Xvfb
    When the hero moves up 1 tiles
    Then the game transitions to "TempleOfFiends"
    And the hero is at tile (20, 29)
    When the hero moves down 1 tiles
    Then the game transitions to "WorldMap"
    And the hero is at tile (18, 12)
