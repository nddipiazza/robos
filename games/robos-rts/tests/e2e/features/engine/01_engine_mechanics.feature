Feature: Deterministic RTS engine mechanics (Humans, Monsters, Aliens)
  As a Lead System Architect and RTS Commander
  I want fluid pathfinding, allied push priority return, wind-up/recovery stutter-step micro,
  Howitzer splash defense, Alien Phase Step Skirmisher & Cliff-Walking Spire Walker micro, and full macro economy
  So that human players and external AI bots experience responsive, zero-gridlock 3-faction RTS gameplay.

  Scenario: Allied push priority yields to marching Howitzer and lowered Provision Silo allows choke traversal
    Given the RTS test scenario "crowd-push-priority" from the knowledge graph
    When player 1 issues "retract_silo" to all "silo" units
    And player 1 issues "move" to unit "marching_howitzer" toward (72.0, 40.0)
    And the simulation advances 420 ticks
    Then unit "marching_howitzer" is within 3.5 units of (72.0, 40.0)
    And unit "idle_blocker" is within 1.8 units of (50.0, 40.0)

  Scenario: Humans Riflemen execute wind-up and recovery stutter-step kiting to defeat Monsters Skitterling pack
    Given the RTS test scenario "stutter-step-micro" from the knowledge graph
    When the simulation advances 520 ticks
    Then player 1 has at least 4 surviving "rifleman" units
    And player 2 has 0 surviving "skitterling" units
    And player 1 has recorded at least 5 stutter-step backswing cancels

  Scenario: Humans Howitzers morph into Emplaced Mode and obliterate Monsters Swarm wave at canyon choke with splash damage
    Given the RTS test scenario "howitzer-canyon-defense" from the knowledge graph
    When the simulation advances 480 ticks
    Then player 1 has at least 3 surviving "howitzer_emplaced" units
    And player 2 has 0 surviving "skitterling" units

  Scenario: Aliens Skirmishers execute Phase Step micro when Aegis Shields drop while Spire Walker cliff-walks to crush Monsters pack
    Given the RTS test scenario "phase-step-spire-walker-vs-monsters" from the knowledge graph
    When player 3 issues "attack_move" to unit "alien_spire_walker" toward (68.0, 40.0)
    And the simulation advances 520 ticks
    Then player 3 has executed at least 2 Skirmisher Phase Steps
    And player 3 has at least 3 surviving "skirmisher" units
    And player 2 has 0 surviving "skitterling" units

  Scenario: Humans Macro Economy harvests crystal, builds a Provision Silo, and trains Riflemen from Muster Hall
    Given the RTS test scenario "colony-macro-economy" from the knowledge graph
    When player 1 orders a worker to build "silo" at (28.0, 28.0)
    And player 1 issues "train_rifleman" to all "muster_hall" units
    And player 1 issues "train_rifleman" to all "muster_hall" units
    And the simulation advances 640 ticks
    Then player 1 has collected at least 40 crystal
    And player 1 has supply cap of at least 31
    And player 1 has at least 2 surviving "rifleman" units

  Scenario: A Gnarl Brood swarm rush across the Starfall Canyon ramp never stalls the simulation
    Given the RTS test scenario "starfall-canyon" from the knowledge graph
    When player 2 enables the "swarm_rush" AI directive
    And player 3 enables the "phase_skirmisher_micro" AI directive
    And the simulation advances 900 ticks
    Then the simulation has reached tick 900
