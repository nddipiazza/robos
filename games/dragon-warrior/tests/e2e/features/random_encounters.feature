Feature: Random encounters system validation
  As a player
  I want random encounters to trigger correctly when walking in danger zones
  So that monsters spawn on the WorldMap, in Hauksness, and in dungeon caves

  Scenario: Random encounter on WorldMap
    Given the game is launched on "WorldMap.tscn" in virtual display Xvfb
    When the player triggers a random encounter with monster "slime"
    Then a battle is active against monster "slime"

  Scenario: Random encounter in Hauksness ruined town
    Given the game is launched on "Hauksness.tscn" at tile (10, 10) facing "down" in virtual display Xvfb
    When the player triggers a random encounter with monster "green_dragon"
    Then a battle is active against monster "green_dragon"

  Scenario: Random encounter in Mountain Cave B1
    Given the game is launched on "MountainCaveB1.tscn" at tile (5, 5) facing "down" in virtual display Xvfb
    And the hero has cast radiant
    When the player triggers a random encounter with monster "druin"
    Then a battle is active against monster "druin"

  Scenario: Step-based random encounter in Swamp Cave
    Given the game is launched on "SwampCave.tscn" at tile (3, 10) facing "down" in virtual display Xvfb
    And the hero has cast radiant
    When the player triggers a random encounter with monster "skeleton"
    Then a battle is active with a monster encounter
