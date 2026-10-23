Feature: Frontier Hunters single-player skirmish
  Two commanders start from scratch at distinct random sites on a rich eight-base map.
  Accelerated tests play paid build orders through the public action/step API.

  Scenario: Seeded starts cover every site and restart without carrying match state
    Given a Frontier Hunters match on "normal" difficulty with "balanced" AI and seed 42
    Then exactly two players each start with a main base and 12 harvesting workers
    And all eight starting sites have rich crystal and aether deposits
    And seeded matches reproduce their starts and can select every site

  Scenario: Unlimited crystal and aether keep paying income after their nominal amount
    Given two workers gathering from one-unit unlimited deposits
    When the simulation advances 2048 ticks
    Then both resources still contain one unit after paying multiple harvests

  Scenario Outline: Build orders play from opening economy through a terminal result
    Given a Frontier Hunters match on "<difficulty>" difficulty with "<enemy_build>" AI and seed <seed>
    When the player plays the "<player_build>" build at accelerated speed for up to 900 game seconds
    Then the match ends by destroying every structure of the defeated player
    And both commanders harvested resources and built their armies from scratch
    And the player produced a "<unit>" through the build order
    And the finished match rejects commands and freezes further simulation

    Examples:
      | difficulty | enemy_build | player_build | seed | unit     |
      | easy       | economy     | rush         | 42   | rifleman |
      | normal     | balanced    | siege        | 17   | howitzer |
      | hard       | rush        | economy      | 81   | rifleman |
      | hard       | siege       | rush         | 29   | rifleman |

  Scenario: An unattended human loses to the AI's real opening and attack
    Given a Frontier Hunters match on "hard" difficulty with "rush" AI and seed 6
    When the player remains idle for up to 900 accelerated game seconds
    Then the AI wins by eliminating the human structures

  Scenario: Destroying only the main base does not eliminate an expansion
    Given a skirmish base-race fixture with an expansion and surviving workers
    When the attackers destroy the main base
    Then the match continues while the expansion survives
    When the attackers destroy the expansion
    Then player 1 wins while enemy workers are still alive

  Scenario: Surrender ends a match and a fresh game clears the result
    Given a Frontier Hunters match on "normal" difficulty with "balanced" AI and seed 42
    When the player surrenders
    Then the AI wins by surrender
    When a new Frontier Hunters match starts
    Then exactly two players each start with a main base and 12 harvesting workers

  Scenario: Illegal production and construction cannot bypass the economy
    Given a Frontier Hunters match on "normal" difficulty with "balanced" AI and seed 42
    Then military units cannot be trained at the main base
    And only workers can build valid unoccupied structures with required technology
