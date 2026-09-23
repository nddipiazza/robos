@normal @invisibility @sanctuary @targeting @equipment
Feature: Invisible Enemy Complete Invisibility, True Sight Gear, and Sanctuary Targeting Restrictions
  As a player engaging in tactical isometric RTwP combat in the RobOS cRPG Realm
  I want invisible enemies to be completely invisible and untargetable unless detected by special gear/divination or dispelled
  And I want characters warded by Sanctuary to be protected from direct targeting
  So that stealth, true sight gear, and abjuration wards follow authentic tactical RPG rules

  Scenario: Invisible enemy is completely invisible and cannot be targeted
    Given an isolated tactical spell encounter "invisible_infiltrator" with hero "Vance" class "wizard" and 30 HP
    Then enemy "stalker_1" is not visible to the player
    When the hero attempts to target "stalker_1" and cast spell "magic-missile"
    Then the targeting fails with error containing "Cannot target an invisible creature that you cannot see"
    When the hero attempts to attack "stalker_1"
    Then the targeting fails with error containing "Cannot target an invisible creature that you cannot see"

  Scenario: Equipping Gem of Seeing reveals invisible enemy with ethereal shimmer and enables targeting
    Given an isolated tactical spell encounter "invisible_infiltrator" with hero "Vance" class "wizard" and 30 HP
    Then enemy "stalker_1" is not visible to the player
    When the hero equips item "gem-of-seeing"
    Then the hero has item "gem-of-seeing" equipped
    And the hero can see invisible creatures
    And enemy "stalker_1" is revealed to the player with ethereal shimmer
    When the hero targets "stalker_1" and casts spell "magic-missile"
    Then the spell "magic-missile" resolves successfully
    When the hero attacks "stalker_1"
    Then enemy "stalker_1" takes 6 damage

  Scenario: Dispelling invisible enemy strips invisibility and restores full visibility to everyone
    Given an isolated tactical spell encounter "invisible_infiltrator" with hero "Vance" class "wizard" and 30 HP
    Then enemy "stalker_1" is not visible to the player
    When the hero targets "stalker_1" and casts spell "dispel-magic"
    Then the spell "dispel-magic" resolves successfully
    And enemy "stalker_1" is completely visible
    When the hero attacks "stalker_1"
    Then enemy "stalker_1" takes 6 damage

  Scenario: Sanctuaried character cannot be targeted by harmful spells or attacks
    Given an isolated tactical spell encounter "sanctuary_warden" with hero "Vance" class "wizard" and 30 HP
    Then enemy "acolyte_1" is protected by sanctuary
    When the hero attempts to target "acolyte_1" and cast spell "magic-missile"
    Then the targeting fails with error containing "Cannot target a sanctuaried character"
    When the hero attempts to attack "acolyte_1"
    Then the targeting fails with error containing "Cannot target a sanctuaried character"

  Scenario: Dispelling Sanctuary removes the divine ward and enables targeting
    Given an isolated tactical spell encounter "sanctuary_warden" with hero "Vance" class "wizard" and 30 HP
    Then enemy "acolyte_1" is protected by sanctuary
    When the hero targets "acolyte_1" and casts spell "dispel-magic"
    Then the spell "dispel-magic" resolves successfully
    And enemy "acolyte_1" is no longer protected by sanctuary
    When the hero attacks "acolyte_1"
    Then enemy "acolyte_1" takes 6 damage
