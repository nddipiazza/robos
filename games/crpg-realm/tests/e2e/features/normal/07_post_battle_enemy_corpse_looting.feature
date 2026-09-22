Feature: Post-Battle Enemy Corpse Looting and Valuables Extraction
  As an adventurer scouring the battlefield after intense combat encounters
  I want to search fallen enemy corpses to collect gold coins, equipment, and consumables
  So that party resources and wealth increase appropriately while preventing duplicate looting

  Background:
    Given the cRPG game is running and healthy
    And an isolated tactical battle with party "Lieutenant Vance" and companions "elora, thrumbar"
    Then the current scene is "TacticalBattle"
    And the tactical battle contains 3 enemies

  Scenario: Searching multiple fallen enemy corpses and asserting inventory and gold increments
    Comprehensive post-battle aftermath validation: scouring defeated enemy corpses across the arena.
    Lieutenant Vance slays the pack leader and loots 30 Gold and a Potion of Healing from its fallen remains.
    Companion Elora brings down the Crypt Skeleton Archer, yielding 20 Gold and a combat Dagger.
    All loot transactions update party gold and inventory counts with on-screen visual confirmation.
    Finally, an exploit prevention guard rejects re-looting stripped corpses with clear audit feedback.
    When the player records the current gold balance
    And the player orders "vance" to attack enemy "wolf_alpha" 3 times
      """
      Lieutenant Vance executes three devastating greatsword strikes to dispatch the Corrupted Wolf Alpha.
      """
    Then the enemy "wolf_alpha" is defeated
    When the player loots corpse "wolf_alpha"
      """
      Approaching and searching the fallen Corrupted Wolf Alpha corpse to extract carried gold and potions.
      """
    Then the corpse "wolf_alpha" is marked as looted
    And the player gold increased by 30
    And the player inventory contains "potion-healing"
    And the activity log contains message "Looted 30 Gold and Potion of Healing"
    When the player orders "elora" to attack enemy "skeleton_archer" 3 times
    Then the enemy "skeleton_archer" is defeated
    When the player loots corpse "skeleton_archer"
    Then the corpse "skeleton_archer" is marked as looted
    And the player gold increased by 20
    And the player inventory contains "dagger"
    And the activity log contains message "Looted 20 Gold and Dagger"
    When the player attempts to loot corpse "wolf_alpha" again
    Then the corpse looting is rejected as already looted
    And the activity log contains message "already been stripped of valuables"
