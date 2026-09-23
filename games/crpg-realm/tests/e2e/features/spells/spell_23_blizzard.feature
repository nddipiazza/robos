@spells @blizzard @cold @ice_hazard
Feature: Spell 23 - Blizzard (3rd Level Evocation & Ground Ice Hazard)
  As an arcane frost evoker in the RobOS cRPG Realm
  I want to channel Blizzard to inflict howling 6d6 cold damage and blanket the arena in slippery ice
  So that enemies are damaged and characters traversing the ice slip prone onto the ground

  Scenario: Blizzard damages enemies, creates slippery ice, cloaked hero walks on ice, slips prone, and stands back up
    Given an isolated tactical spell encounter "incoming_striker" with hero "Vance" class "wizard" and 30 HP
    When the hero casts spell "blizzard" at (620, 520)
    Then the spell "blizzard" resolves successfully
    And enemy "striker_1" takes 6 damage
    And a slippery ice patch exists on the ground at (620, 520)
    When the hero receives item "potion-invisibility"
    And the hero drinks "potion-invisibility"
    Then the hero is invisible with translucent shimmer
    When the hero moves to (620, 520) onto the ice
    Then the hero slips on the ice and is knocked prone
    And the hero is flat on the ground with sprite rotation of 90 degrees
    When the prone turn duration of 3.5 seconds expires
    Then the hero stands back up from prone upright
