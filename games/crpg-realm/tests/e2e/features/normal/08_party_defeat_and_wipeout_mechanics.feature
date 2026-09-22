Feature: Tactical Battle Defeat, Party Wipeout and Encounter Retry
  As players facing overwhelming tactical odds in the Realm of Heroes
  I want a clear defeat state and interactive game-over screen when the full party falls
  So that party casualties are tracked properly and players can retry the encounter with full recovery

  Background:
    Given the cRPG game is running and healthy
    And an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    Then the current scene is "TacticalBattle"
    And the defeat screen is not visible

  Scenario: Full party wipeout triggers Defeat Screen and retry restores the party
    Validating tactical game-over triggers, party wipeout states, and encounter retry mechanics.
    As all party members suffer lethal damage, characters collapse with the [UNCONSCIOUS] condition.
    The encounter pauses automatically and summons the blood-red Defeat Screen modal with casualty tallies.
    Finally, the player clicks 'Retry Encounter', which cleanses unconsciousness, revives all members, and resets the fight.
    When enemy "wolf_alpha" strikes party member "Lieutenant Vance" with a lethal blow
      """
      Corrupted Wolf Alpha lunges from the frontline and delivers a savage critical strike to Lieutenant Vance.
      """
    Then party member "Lieutenant Vance" is dead and highlighted red in the party HUD
    When enemy "skeleton_archer" strikes party member "Elora" with a lethal blow
      """
      Crypt Skeleton Archer unleashes a dark piercing arrow into Elora, dropping her to 0 hit points.
      """
    Then party member "Elora" is dead and highlighted red in the party HUD
    When enemy "shadow_stalker" strikes party member "Thrumbar" with a lethal blow
      """
      Shadow Stalker ambushes Thrumbar with dual poisoned daggers, inflicting fatal retribution damage.
      """
    Then party member "Thrumbar" is dead and highlighted red in the party HUD
    Then the party is wiped out
    And the defeat screen is visible
    And the activity log contains message "ALL PARTY MEMBERS HAVE FALLEN"
    When the player clicks retry on the defeat screen
      """
      Clicking the Retry Encounter button on the Defeat Screen to restore all fallen companions and resume combat.
      """
    Then the defeat screen is not visible
    And the party is revived with all members restored
    And no party members are highlighted red in the party HUD
    And the activity log contains message "Party revived and restored! Encounter ready to resume."
