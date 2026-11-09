@realtime @soak
Feature: Finite skirmish play and repeated rematches stay clean
  Scenario: A paid economy and battles survive a long live match and four rematches
    Given a finite Iron Narrows soak match starts with standard economies
    When the player runs a paid economy and army on the live clock
    Then the live match sustained depletion, an expansion and repeated combat
    When the player restarts the same match four times and pays for a worker each time
    Then the rematches reset the battlefield without growing its scene nodes or memory
