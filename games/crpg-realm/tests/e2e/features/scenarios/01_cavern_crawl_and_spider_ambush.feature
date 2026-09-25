@real_crpg @scenario @cavern
Feature: Subterranean Cavern Crawl and Arachnid Ambush
  As a veteran adventuring party delving into the subterranean cavern depths
  I want to navigate narrow corridors, neutralize goblin sentries, avoid sticky spider webs, and slay the bugbear chieftain
  So that we secure the cavern choke point and recover the delver's mineral chest

  Background:
    Given the cRPG game is running and healthy
    And an isolated leveled adventure in scene "TacticalBattle" with party "underdark-incursion"
    Then the current scene is "TacticalBattle"
    And the active party contains 3 members

  Scenario: Level 3 Party clears goblin sentries at the narrow choke point
    When the party changes formation to "wedge"
    Then the party formation is "wedge"
    When the player queues action "attack" on the action toolbar
    And hero "Sir Valen" unleashes fighter ability "crushing-cleave" on goblin sentry
    Then the activity log contains message "CRUSHING CLEAVE"
    And the goblin sentry is slain

  Scenario: Party navigates spider web hazard and wizard casts Burning Hands
    When the party advances across the limestone cavern toward the webbed stalagmites
    Then the thick spider webs inflict difficult terrain movement
    When wizard "Sylphira" casts spell "burning-hands" incinerating the spider webs
    Then the spider webs are burned away and difficult terrain is cleared
    And the giant wolf spider ambushes the party from the stalagmites
    When cleric "Brother Kaelen" casts spell "spiritual-weapon"
    Then the giant wolf spider is slain

  Scenario: Party crosses natural stone bridge and defeats Bugbear Chieftain
    When the party advances across the natural stone bridge
    Then the bugbear cave chieftain roars and engages in heavy melee combat
    When hero "Sir Valen" triggers Action Surge to strike twice with Greatsword +1
    And rogue "Lyra" lands sneak attack with Shortbow +1
    Then the bugbear cave chieftain is vanquished
    When rogue "Lyra" disarms lock on the delver's mineral chest
    Then the party acquires item "180 Gold Coins"
    And the party acquires item "Raw Rough Emerald"
