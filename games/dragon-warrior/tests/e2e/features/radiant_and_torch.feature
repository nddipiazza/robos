Feature: Radiant Spell and Torch Item Light Sources in Dungeons

  Scenario: Unlit cave initializes with pitch black overlay and 1x1 hero tile visibility (radius 0)
    Given the game is launched on "ErdricksCaveB1.tscn" in virtual display Xvfb
    Then the light status should report is_dark is true
    And the light status should report torch_active is false
    And the light status should report light_radius is 0

  Scenario: Lighting a Torch expands visibility to a 3x3 square tile grid (radius 1)
    Given the game is launched on "ErdricksCaveB1.tscn" in virtual display Xvfb
    When the hero has lit a torch
    Then the light status should report torch_active is true
    And the light status should report light_radius is 1

  Scenario: Casting Radiant spell expands visibility to a 7x7 square tile grid (radius 3)
    Given the game is launched on "ErdricksCaveB1.tscn" in virtual display Xvfb
    When the hero has cast radiant
    Then the light status should report light_radius is 3
