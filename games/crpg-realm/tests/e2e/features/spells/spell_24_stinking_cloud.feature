@spells @stinking_cloud @poison @mist_hazard
Feature: Spell 24 - Stinking Cloud (3rd Level Conjuration & Volumetric Mist Hazard)
  As an arcane conjurer in the RobOS cRPG Realm
  I want to conjure Stinking Cloud to blanket the arena in billowing nauseating green mist
  So that enemies suffer toxic damage and characters traversing the volumetric vapors are overcome by retching nausea and collapse prone

  Scenario: Stinking Cloud damages enemies, forms volumetric mist without hard circles, cloaked hero enters vapors, collapses prone, and stands back up
    Stinking Cloud fills a 20-ft-radius sphere (5e SRD; in the Infinity Engine it shares Fireball's 256-unit area).
    The dense vapour bank hugs the floor while thin wisps drift in front, so a character inside is immersed, not erased.
    Given an isolated tactical spell encounter "distant_striker" with hero "Vance" class "wizard" and 30 HP
    When the hero casts spell "stinking-cloud" at (900, 520)
    Then the spell "stinking-cloud" resolves successfully
    And enemy "striker_1" inside the stinking cloud took damage
    And a volumetric stinking cloud mist exists on the ground at (900, 520)
    And the stinking cloud footprint is 20 feet in radius with matching collision and visuals
    And the hero is standing outside the hazard at (900, 520)
    When the hero receives item "potion-invisibility"
    And the hero drinks "potion-invisibility"
    Then the hero is invisible with translucent shimmer
    When the hero moves to (820, 540) into the stinking cloud
    Then the hero is overcome by nauseating vapors and collapses prone
    And the hero touched the stinking cloud inside its radius and is drawn on top of its floor layer
    And the stinking cloud wisps drift in front of the hero
    And the hero is flat on the ground with sprite rotation of 90 degrees
    When the prone turn duration of 3.5 seconds expires
    Then the hero stands back up from prone upright
    And the knockdown lasted less than one Infinity Engine round
