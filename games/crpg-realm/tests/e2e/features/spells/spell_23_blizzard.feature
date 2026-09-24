@spells @blizzard @cold @ice_hazard
Feature: Spell 23 - Blizzard (3rd Level Evocation & Ground Ice Hazard)
  As an arcane frost evoker in the RobOS cRPG Realm
  I want to channel Blizzard to inflict howling 6d6 cold damage and blanket the arena in slippery ice
  So that enemies are damaged and characters traversing the ice slip prone onto the ground

  Scenario: Blizzard damages enemies, creates slippery ice, cloaked hero walks on ice, slips prone, and stands back up
    The evoker hurls the storm at an orc waiting across the arena, well clear of her own position.
    The freezing burst covers a 20-ft radius and leaves a sheet of glassy ice on the floor.
    Anyone walking onto the ice is drawn ON TOP of the frozen floor decal, never beneath it.
    Given an isolated tactical spell encounter "distant_striker" with hero "Vance" class "wizard" and 30 HP
    When the hero casts spell "blizzard" at (900, 520)
    Then the spell "blizzard" resolves successfully
    And enemy "striker_1" inside the ice patch took damage
    And a slippery ice patch exists on the ground at (900, 520)
    And the ice patch footprint is 20 feet in radius with matching collision and visuals
    And the hero is standing outside the hazard at (900, 520)
    When the hero receives item "potion-invisibility"
    And the hero drinks "potion-invisibility"
    Then the hero is invisible with translucent shimmer
    When the hero moves to (820, 540) onto the ice
    Then the hero slips on the ice and is knocked prone
    And the hero touched the ice patch inside its radius and is drawn on top of its floor layer
    And the hero is flat on the ground with sprite rotation of 90 degrees
    When the prone turn duration of 3.5 seconds expires
    Then the hero stands back up from prone upright
    And the knockdown lasted less than one Infinity Engine round
