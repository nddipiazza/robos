@real_crpg @scenario @candlekeep @quest_tree
Feature: Candlekeep: The Prophecy Begins — Campaign Quest Scenario Tree
  As Gorion's ward and the Candlekeep adventuring party
  I want the real cRPG game to render the campaign in its current state
  And play through the full quest scenario tree across Prologue, Coast Way Ambush, and the Climax
  So that the story tree, party mechanics, dialogue, and combat trials resolve to Victory

  Background:
    Given the cRPG game is running and healthy
    And the campaign "candlekeep-prologue" is rendered as game in its current state
    Then the current scene is "Homestead"
    And the active party contains 6 members
    And hero "Vance" is the party leader

  Scenario: Act 1 Prologue — Awakening in Candlekeep and Gathering Supplies
    When Gorion delivers the prophetic warning at the library steps
    Then quest "q-gorion-departure" is advanced to stage 1
    When the party visits Winthrop at Candlekeep Inn for travel provisions
    Then the party acquires item "Herb (Restores 20-35 HP)"
    And the party acquires item "Magic Key (Opens Royal Doors)"
    And story flag "spoke_to_winthrop" is set

  Scenario: Act 1 Prologue — Sanctuary Ambush by Iron Throne Assassins
    When assassin "Shank" ambushes the party with a poisoned dagger
    Then rogue "Imoen" lands sneak attack with shortbow eliminating Shank
    When assassin "Carbos" lunges from the shadows
    Then wizard "Ignis" casts spell "burning-hands" incinerating Carbos
    And story flag "shank_defeated" is set
    And story flag "carbos_defeated" is set

  Scenario: Act 2 Chapter 1 — The Coast Way Ambush and Gorion's Last Stand
    When the party departs Candlekeep gates onto the Coast Way
    Then the current scene is "TacticalBattle"
    When the armored figure and mercenary warband spring a deadly night ambush
    Then Gorion casts protective wards to allow the ward and Imoen to flee
    And hero "Vance" rallies companion "Elora" and companion "Faerun" in rank formation
    When cleric "Thrumbar" casts spell "bless" on the frontline fighters
    Then the mercenary vanguard is held at bay
    And story flag "ambush_survived" is set

  Scenario: Act 3 Finale & Epilogue — Confrontation with Sarevok and Heroic Triumph
    When the party uncovers the Iron Throne conspiracy in the citadel war room
    Then the party confronts the armored warlord in climactic combat
    When paladin "Faerun" smites the corrupted warlord with divine power
    And hero "Vance" delivers the final strike with the service blade
    Then the armored warlord is vanquished
    And the campaign reaches end game state "Heroic Triumph"
    And the victory screen is visible
