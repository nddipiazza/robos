Feature: Infinity Engine Invisibility Spell, Physical Action Dispelling & AI Aggro Detection
  As an adventurer utilizing arcane illusion magic in the Infinity Engine RTwP system
  I want Invisibility to conceal my party members so we can cruise past hostile enemies undetected
  And I want Invisibility to dispel upon taking physical actions, when dispelled by abjuration, or upon timeout
  And I want enemies to immediately detect and aggro on the newly visible character on the next AI tick when it expires
  So that stealth, scouting, and tactical ambush mechanics mirror authentic D&D 5e and Infinity Engine rules

  Background:
    Given the cRPG game is running and healthy

  Scenario: Invisible party member cruises past hostile enemies without triggering conflict or aggro
    An adventurer under the effect of Invisibility weaves through enemy patrol routes undetected.
    Hostile creatures within normal visual proximity (280px) fail to detect the invisible form.
    The party member safely traverses past the beasts without provoking attack or entering combat.
    Given an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    Then the current scene is "TacticalBattle"
    And all tactical enemies are on patrol with no targets
    When the player casts spell "invisibility" on "Lieutenant Vance"
    Then "Lieutenant Vance" has status effect "invisible"
    And the character sprite of "Lieutenant Vance" is translucent with 35% opacity
    When the player moves "Lieutenant Vance" directly through the patrol zone of hostile enemy "wolf_alpha" within 80px
    Then the enemy "wolf_alpha" remains in state "PATROL" and ignores the invisible intruder
    And the enemy "wolf_alpha" target is none

  Scenario: Invisibility dispels when physical attack action is taken against enemy
    According to standard D&D 5e and Infinity Engine rules, attacking prematurely breaks invisibility.
    The moment a weapon swing or physical strike is initiated, light-bending illusion magic shatters.
    The attacker becomes completely visible, and the struck enemy reacts immediately to engage.
    Given an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    When the player casts spell "invisibility" on "Lieutenant Vance"
    Then "Lieutenant Vance" has status effect "invisible"
    And the character sprite of "Lieutenant Vance" is translucent with 35% opacity
    When the player orders "vance" to attack enemy "wolf_alpha"
    Then the invisibility effect on "Lieutenant Vance" is immediately broken by physical attack
    And the character sprite of "Lieutenant Vance" returns to full opacity
    And enemy "wolf_alpha" target is "Lieutenant Vance"
    And the activity log contains message "Invisibility broke! Lieutenant Vance performed a physical attack"

  Scenario: Invisibility dispels when explicitly dispelled by Dispel Magic
    Magical abjuration can strip away active illusions and glamours from allies or foes.
    Casting Dispel Magic purges the invisible condition and restores normal visual opacity.
    Given an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    When the player casts spell "invisibility" on "Lieutenant Vance"
    Then "Lieutenant Vance" has status effect "invisible"
    And the character sprite of "Lieutenant Vance" is translucent with 35% opacity
    When the player casts spell "dispel-magic" on "Lieutenant Vance"
    Then "Lieutenant Vance" is no longer afflicted with "invisible"
    And the character sprite of "Lieutenant Vance" returns to full opacity
    And the activity log contains message "Dispel Magic on Lieutenant Vance"

  Scenario: Invisibility timeout override, expiration next to enemy, and immediate proximity aggro
    Invisibility naturally wears off after its duration expires.
    The automated test harness overrides the timeout duration to 1.5 seconds, logging the test hack.
    The hero moves while invisible directly into point-blank range of a hostile predator and waits.
    The moment the timer runs out, invisibility dispels and the AI engine detects the intruder on the next tick.
    Given an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    When the test harness overrides the invisibility timeout for "Lieutenant Vance" to 1.5 seconds for test verification
    And the activity log explicitly notes that the test harness hacked the timeout
    When the player casts spell "invisibility" on "Lieutenant Vance" with timeout override of 1.5 seconds
    Then "Lieutenant Vance" has status effect "invisible"
    When the player moves "Lieutenant Vance" to stand 80px away from hostile enemy "wolf_alpha"
    Then the enemy "wolf_alpha" remains in state "PATROL" and ignores the invisible intruder
    When the player waits 2.0 seconds for the overridden invisibility timeout to naturally expire
    Then the invisibility effect on "Lieutenant Vance" has expired
    And on the next engine tick the AI engine detects the visible intruder
    And enemy "wolf_alpha" target is "Lieutenant Vance"
    And the activity log contains message "hostile and aggravated by proximity to Lieutenant Vance"
