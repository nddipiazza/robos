Feature: Infinity Engine Traps Detection, Disarming, and Trigger Resolution
  As an adventurer exploring subterranean catacombs and ancient vaults
  I want thieves and divine spellcasters to detect concealed traps and disarm them with specialized tools
  And I want armed traps to trigger saving throws, elemental damage, and status conditions when stepped on
  So that dungeon exploration delivers authentic tactical danger mirroring classic Infinity Engine RPGs

  Background:
    Given the cRPG game is running and healthy

  Scenario: Thief active Find Traps skill detects a concealed floor trap
    A rogue in the party toggles the modal Find Traps skill to sweep the surrounding flagstones.
    The rogue rolls a Wisdom (Perception) check against the trap's concealment DC 13.
    Upon success, the concealed Poison Dart Trap is illuminated in pulsing red danger runes.
    Given an isolated test starting in scene "AncientCatacombs" with party "Bramble" the "rogue"
    Then the current scene is "AncientCatacombs"
    And the scene contains concealed traps
    When the player enables Find Traps mode
    Then the trap "poison-dart-trap" is detected and highlighted in red
    And the activity log contains message "spotted Concealed Poison Dart Trap"

  Scenario: Cleric casts Find Traps divination spell revealing all area hazards
    A divine spellcaster channels holy sight through the 2nd-level divination spell Find Traps.
    The spell radiates across the chamber, piercing all physical concealment without requiring an ability check.
    Every mechanical and magical trap within range is illuminated with glowing red runes.
    Given an isolated test starting in scene "AncientCatacombs" with party "Thrumbar" the "cleric"
    Then the current scene is "AncientCatacombs"
    When the player casts spell "find-traps"
    Then all concealed traps in the area are revealed in glowing red runes
    And the activity log contains message "Find Traps! Divine divination radiates across the area"

  Scenario: Thief uses Thieves' Tools to successfully disarm a detected trap
    With the Poison Dart Trap revealed in red highlight, the rogue steps forward with Thieves' Tools.
    The rogue rolls a Dexterity (Thieves' Tools) check against the mechanism's disarm DC 14.
    Upon succeeding, the pressure plate is safely wedged and dismantled, rendering it harmless.
    Given an isolated test starting in scene "AncientCatacombs" with party "Bramble" the "rogue"
    When the trap "poison-dart-trap" is revealed
    And the player orders "Bramble" to disarm trap "poison-dart-trap"
    Then the party member is standing next to trap "poison-dart-trap"
    And the trap "poison-dart-trap" is disarmed
    And the activity log contains message "safely disarmed Concealed Poison Dart Trap with Thieves' Tools"

  Scenario: Stepping onto an armed trap triggers saving throws, damage, and poison condition
    An unwary warrior marches down the central corridor without checking for hidden hazards.
    Stepping on the concealed pressure plate fires poisoned iron darts from the crypt walls.
    The victim rolls a Constitution saving throw vs DC 13, taking damage and contracting the poisoned status.
    Given an isolated test starting in scene "AncientCatacombs" with party "Lieutenant Vance" the "fighter"
    When the party member steps onto trap "poison-dart-trap"
    Then the party member walked over trap "poison-dart-trap"
    And the trap "poison-dart-trap" is triggered
    And the trap "poison-dart-trap" is no longer appearing on the map
    And the party member suffers trap damage
    And the player suffers status effect "poisoned"
    And the activity log contains message "TRAP TRIGGERED"

  Scenario: Fumbling a high-DC trap disarm attempt detonates the trap
    Attempting to disarm an explosive Glyph of Warding (DC 15) carries severe hazard risk.
    A critical fumble on the disarm roll prematurely trips the delicate rune triggers.
    The glyph detonates directly in the disarmer's face, forcing an immediate Dexterity save against fire damage.
    Given an isolated test starting in scene "AncientCatacombs" with party "Bramble" the "rogue"
    When the trap "glyph-of-warding" is revealed
    And the disarm attempt on trap "glyph-of-warding" critically fumbles
    Then the party member is standing next to trap "glyph-of-warding"
    And the trap "glyph-of-warding" is triggered
    And the trap "glyph-of-warding" is no longer appearing on the map
    And the activity log contains message "TRAP ACCIDENTAL TRIGGER"

  Scenario: Disarming from afar requires walking next to trap while direct remote disarm fails
    Adventurers cannot dismantle mechanical trigger plates or diffuse mystical runes from across the room.
    Attempting to disarm without closing the distance to adjacent range is rejected by the engine.
    Given an isolated test starting in scene "AncientCatacombs" with party "Bramble" the "rogue"
    When the trap "spike-pit-trap" is revealed
    Then a direct disarm on trap "spike-pit-trap" from afar without walking is rejected

  Scenario: Traps do not trigger remotely without walking over the hazard
    Pressure plates and runes require physical contact to spring.
    An adventurer standing across the hall cannot accidentally spring the trap without walking over it.
    Given an isolated test starting in scene "AncientCatacombs" with party "Lieutenant Vance" the "fighter"
    Then a remote trigger on trap "spike-pit-trap" without walking over it is rejected

