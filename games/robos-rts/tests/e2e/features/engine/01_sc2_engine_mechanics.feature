Feature: StarCraft II & SnowPlay Inspired Deterministic RTS Engine Mechanics (Humans, Monsters, Aliens)
  As a Lead System Architect and RTS Commander
  I want fluid SC2 pathfinding, allied PushPriority return, DamagePoint/Backswing stutter-step micro,
  Siege Tank splash defense, Alien Blink Stalker & Cliff-Walking Colossus micro, and full macro economy
  So that human players and s2client-proto AI bots experience responsive, zero-gridlock 3-faction RTS gameplay.

  Scenario: Allied PushPriority yields to marching Siege Tank and lowered Supply Depot allows choke traversal
    Given the RTS test scenario "crowd-push-priority" from the knowledge graph
    When player 1 issues "lower_depot" to all "supply_depot" units
    And player 1 issues "move" to unit "marching_tank" toward (72.0, 40.0)
    And the simulation advances 420 ticks
    Then unit "marching_tank" is within 3.5 units of (72.0, 40.0)
    And unit "idle_blocker" is within 1.8 units of (50.0, 40.0)

  Scenario: Humans Marines execute SC2 DamagePoint and Backswing stutter-step kiting to defeat Monsters Swarmling pack
    Given the RTS test scenario "stutter-step-micro" from the knowledge graph
    When the simulation advances 520 ticks
    Then player 1 has at least 4 surviving "marine" units
    And player 2 has 0 surviving "swarmling" units
    And player 1 has recorded at least 5 stutter-step backswing cancels

  Scenario: Humans Siege Tanks morph into Siege Mode and obliterate Monsters Swarm wave at canyon choke with splash damage
    Given the RTS test scenario "siege-canyon-defense" from the knowledge graph
    When the simulation advances 480 ticks
    Then player 1 has at least 3 surviving "siege_tank_sieged" units
    And player 2 has 0 surviving "swarmling" units

  Scenario: Aliens Stalkers execute Blink micro when Plasma Shields drop while Colossus cliff-walks to crush Monsters pack
    Given the RTS test scenario "alien-blink-colossus-vs-monsters" from the knowledge graph
    When player 3 issues "attack_move" to unit "alien_colossus" toward (68.0, 40.0)
    And the simulation advances 520 ticks
    Then player 3 has executed at least 2 Stalker Blinks
    And player 3 has at least 3 surviving "stalker" units
    And player 2 has 0 surviving "swarmling" units

  Scenario: Humans Macro Economy harvests minerals, builds a Supply Depot, and trains Marines from Barracks
    Given the RTS test scenario "terran-macro-economy" from the knowledge graph
    When player 1 orders a worker to build "supply_depot" at (28.0, 28.0)
    And player 1 issues "train_marine" to all "barracks" units
    And player 1 issues "train_marine" to all "barracks" units
    And the simulation advances 640 ticks
    Then player 1 has collected at least 40 minerals
    And player 1 has supply cap of at least 31
    And player 1 has at least 2 surviving "marine" units
