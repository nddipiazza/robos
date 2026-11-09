@asymmetric
Feature: Skirmish factions have distinct openings and paid opponents
  Scenario: Every faction can occupy either seat and Random rematches repeat
    Given the skirmish faction rosters
    Then every pairing starts with twelve workers and one base per seat
    And the same seed repeats the Random factions and starting sites
    And an invalid faction leaves the active match intact

  Scenario Outline: A faction AI defeats an unattended commander with a paid opening
    Given an Iron Narrows match against the "<opponent>" siege AI
    When the commander remains idle for up to 550 game seconds
    Then the AI wins with paid "<supply>" and "<extractor>" structures and trained combat units

    Examples:
      | opponent | supply     | extractor    |
      | monsters | brood_pod  | spore_tap    |
      | aliens   | resonator  | aether_prism |
