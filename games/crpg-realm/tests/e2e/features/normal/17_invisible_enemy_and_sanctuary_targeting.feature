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
    Infinity Engine rule: every creature sees 448 IE units (~30 ft, the edge of the fog-of-war circle),
    blocked only by walls. True sight from the Gem of Seeing pierces invisibility only inside that range,
    so the wearer must close the distance before the cultist shimmers into view.
    Given an isolated tactical spell encounter "invisible_infiltrator" with hero "Vance" class "wizard" and 30 HP
    Then enemy "stalker_1" is not visible to the player
    And the hero has a visual range of 38 feet
    And the hero's visual range equals the fog-of-war sight circle
    When the hero equips item "gem-of-seeing"
    Then the hero has item "gem-of-seeing" equipped
    And the hero can see invisible creatures
    And enemy "stalker_1" remains hidden beyond the wearer's visual range
    When the hero advances to (900, 520) within visual range
    Then a true-sight reveal of "stalker_1" fired inside visual range with clear line of sight
    And enemy "stalker_1" is revealed to the player with ethereal shimmer
    When the hero targets "stalker_1" and casts spell "magic-missile"
    Then the spell "magic-missile" resolves successfully
    When the hero attacks "stalker_1"
    Then enemy "stalker_1" takes 6 damage

  Scenario: Dispelling invisible enemy strips invisibility and restores full visibility to everyone
    Dispel Magic in BG/IWD is an area burst: every creature caught inside loses its enchantments.
    Two cultists huddled together are both exposed, while a sentry lurking outside the 20-ft burst stays invisible.
    Given an isolated tactical spell encounter "invisible_ambush" with hero "Vance" class "wizard" and 30 HP
    Then enemy "stalker_1" is not visible to the player
    And enemy "stalker_2" is not visible to the player
    And enemy "stalker_3" is not visible to the player
    When the hero targets "stalker_1" and casts spell "dispel-magic"
    Then the spell "dispel-magic" resolves successfully
    And the dispel burst covers a 20 foot radius
    And the dispel burst stripped "stalker_1" and "stalker_2" but not "stalker_3" outside its 20 foot radius
    And enemy "stalker_1" is completely visible
    And enemy "stalker_2" is completely visible
    And enemy "stalker_3" is still invisible
    When the hero attacks "stalker_1"
    Then enemy "stalker_1" takes 6 damage

  Scenario: Sanctuaried character cannot be targeted by harmful spells or attacks
    The acolyte's overhead ward label "🕊️ [SANCTUARY - Untargetable]" must render its dove emoji and
    variation selector through the bundled font chain — no tofu "domino" boxes on any machine.
    Given an isolated tactical spell encounter "sanctuary_warden" with hero "Vance" class "wizard" and 30 HP
    Then enemy "acolyte_1" is protected by sanctuary
    And the label "SANCTUARY - Untargetable" renders every glyph with the bundled font chain
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
