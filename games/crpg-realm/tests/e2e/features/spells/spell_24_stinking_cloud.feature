@spells @stinking_cloud @poison @mist_hazard
Feature: Spell 24 - Stinking Cloud (3rd Level Conjuration & Volumetric Mist Hazard)
  As an arcane conjurer in the RobOS cRPG Realm
  I want to conjure Stinking Cloud to blanket the arena in billowing nauseating green mist
  So that enemies suffer toxic damage and characters traversing the volumetric vapors are overcome by retching nausea and collapse prone

  Scenario: Stinking Cloud damages enemies, forms volumetric mist without hard circles, cloaked hero enters vapors, collapses prone, and stands back up
    Given an isolated tactical spell encounter "incoming_striker" with hero "Vance" class "wizard" and 30 HP
    When the hero casts spell "stinking-cloud" at (620, 520)
    Then the spell "stinking-cloud" resolves successfully
    And enemy "striker_1" takes 2 damage
    And a volumetric stinking cloud mist exists on the ground at (620, 520)
    When the hero receives item "potion-invisibility"
    And the hero drinks "potion-invisibility"
    Then the hero is invisible with translucent shimmer
    When the hero moves to (620, 520) into the stinking cloud
    Then the hero is overcome by nauseating vapors and collapses prone
    And the hero is flat on the ground with sprite rotation of 90 degrees
    When the prone turn duration of 3.5 seconds expires
    Then the hero stands back up from prone upright
