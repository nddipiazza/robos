Feature: Infinity Engine Dynamic Threat Aggravation and Aggro Target Switching
  As tactical combatants managing enemy threat in the Infinity Engine RTwP system
  I want enemies to dynamically target party members based on proximity and threat accumulation
  So that fragile companions can be peeled by tanks through taunts and heavy attacks when aggravated

  Background:
    Given the cRPG game is running and healthy
    And an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    Then the current scene is "TacticalBattle"
    And the tactical battle contains 3 enemies

  Scenario: Enemy target aggravation and aggro peeling between tank and ranged companion
    This tactical encounter validates the Infinity Engine dynamic threat and aggro table mechanics in real time.
    Lieutenant Vance engages the Corrupted Wolf Alpha with melee strikes to establish initial frontline aggro.
    Companion Elora then executes rapid ranged bow attacks, accumulating threat until exceeding the 115% threshold.
    The enraged beast breaks off its target and pivots toward Elora, demonstrating dynamic companion threat.
    Finally, Lieutenant Vance activates a martial taunt to peel aggro back to the party tank, securing party survival.
    When the player orders "vance" to attack enemy "wolf_alpha"
      """
      Lieutenant Vance closes to melee range and strikes the Corrupted Wolf Alpha to establish frontline threat.
      """
    Then the enemy "wolf_alpha" target is "Lieutenant Vance"
    And the enemy "wolf_alpha" threat for "Lieutenant Vance" is greater than 10
    When the player orders "elora" to attack enemy "wolf_alpha" 3 times
      """
      Companion Elora unleashes three rapid bow shots, escalating threat until it eclipses Vance's aggro threshold.
      """
    Then the enemy "wolf_alpha" target is "Elora"
    And the enemy "wolf_alpha" threat for "Elora" is greater than 25
    And the activity log contains message "switches target to Elora"
    When the player commands "Lieutenant Vance" to taunt enemy "wolf_alpha"
      """
      Lieutenant Vance roars a challenging battle cry, injecting +60 threat to forcefully peel aggro back to the tank.
      """
    Then the enemy "wolf_alpha" target is "Lieutenant Vance"
    And the enemy "wolf_alpha" threat for "Lieutenant Vance" is greater than 60
    And the activity log contains message "taunted Corrupted Wolf Alpha! Aggro forcefully diverted!"

  Scenario: Pack enemies aggravate and rally to attack when their ally is struck
    Validates Infinity Engine social and pack aggro behavior in real-time tactical combat.
    Striking Corrupted Wolf Alpha alerts its pack allies Crypt Skeleton Archer and Shadow Stalker.
    Allies notice their friend's plight and immediately rally to defend against Vance.
    Patrolling enemies break formation, accumulate defensive threat, and pivot to engage the party.
    When the player orders "vance" to attack enemy "wolf_alpha"
      """
      Lieutenant Vance strikes Corrupted Wolf Alpha, alerting all pack allies in the encounter.
      """
    Then the enemy "skeleton_archer" target is "Lieutenant Vance"
    And the enemy "shadow_stalker" target is "Lieutenant Vance"
    And the activity log contains message "aggravated to defend"

  Scenario: Hostile enemy aggravates when approached within proximity distance and close pack friends also aggro
    Validates Infinity Engine hostile proximity aggravation and pack ally chaining in tactical combat.
    Enemies in the hostile state continuously scan for party members within their 280px aggro radius.
    Closing distance toward Corrupted Wolf Alpha causes the beast to detect the intruder and aggro.
    The aggravated wolf sounds an alarm that reverberates to all nearby pack allies within 480px.
    Crypt Skeleton Archer is stationed close enough (216px away) and immediately rallies to attack Vance.
    Shadow Stalker is stationed far away (>800px) and remains peaceful on patrol, demonstrating pack distance limits.
    Then all tactical enemies are on patrol with no targets
    When enemy "shadow_stalker" is stationed at position 2200, 680
      """
      Shadow Stalker is stationed far beyond pack support range (930px away) to verify friend distance thresholds.
      """
    And the player approaches within proximity distance of enemy "wolf_alpha"
      """
      Lieutenant Vance moves across the tactical arena to within 220px of hostile Corrupted Wolf Alpha.
      """
    Then enemy "wolf_alpha" becomes aggravated with target "Lieutenant Vance"
    And enemy "wolf_alpha" state is "CHASE"
    And close pack friend "skeleton_archer" also aggros on "Lieutenant Vance"
    And close pack friend "skeleton_archer" state is "CHASE or ATTACK"
    And distant pack friend "shadow_stalker" remains on patrol with no target
    And the activity log contains message "is hostile and aggravated by proximity"
    And the activity log contains message "rallies with close ally"

  Scenario: Non-hostile enemy does not aggravate on proximity and ignores intruder
    Validates that non-hostile or passive creatures do not trigger proximity aggro or alert friends.
    Once Corrupted Wolf Alpha is set to passive state, it ignores approaching party members completely.
    Lieutenant Vance can freely move within intimate proximity without drawing aggro or triggering combat.
    When enemy "wolf_alpha" hostility is set to "passive"
      """
      Corrupted Wolf Alpha is set to a non-hostile passive state for observation.
      """
    Then enemy "wolf_alpha" hostility is "passive"
    When the player approaches within proximity distance of enemy "wolf_alpha"
      """
      Lieutenant Vance approaches within 220px of the passive wolf.
      """
    Then non-hostile enemy "wolf_alpha" remains on patrol with no target
    And distant pack friend "skeleton_archer" remains on patrol with no target
    And distant pack friend "shadow_stalker" remains on patrol with no target
    And the activity log does not contain message "is hostile and aggravated by proximity"

