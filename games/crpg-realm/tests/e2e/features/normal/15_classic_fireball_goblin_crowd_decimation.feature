Feature: Classic 8d6 Fireball AoE Spell and Goblin Crowd Decimation
  As an evocation wizard facing a horde of enemies
  I want to cast the classic 8d6 Fireball spell into a tightly packed crowd of goblins
  So that the authentic Infinity Engine AoE blast radius, 8d6 fire damage roll, and Dexterity saving throws decimate the goblin crowd without artificial hacks

  Background:
    Given the cRPG game is running and healthy
    And an isolated goblin crowd encounter with wizard "Ignis the Evoker" and 6 goblins of 7 HP each
    Then the current scene is "TacticalBattle"
    And the wizard hero has class "wizard" and 35 HP
    And the tactical battle contains 6 goblins with 7 HP each

  Scenario: Wizard casts Fireball on goblin crowd, rolling 8d6 fire damage and decimating the horde
    When the wizard targets the goblin crowd at (1150, 520) and casts "fireball"
    Then a fiery projectile streaks to the target point and detonates in a 20ft radius explosion
    And the spell rolls authentic 8d6 fire damage with minimum 8 damage
    And each goblin within the 180px blast radius rolls a Dexterity saving throw vs DC 14
    And all 6 goblins take lethal fire damage exceeding their 7 HP
    And all 6 goblins are slain simultaneously by the fire blast
    And the activity log records the fiery explosion and goblin deaths
    And the tactical battle signals total victory over the goblin horde
