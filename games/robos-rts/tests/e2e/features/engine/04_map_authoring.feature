Feature: Reusable RTS map authoring
  Maps are editable assets shared by the engine and the editor, with scenario
  metadata retained for campaign and future multiplayer consumers.

  Scenario: A real mouse stroke survives save, playtest and editor return with undo history
    Given the Frontier Hunters map is open in the editor
    Then the editor preserves the 256 square map, waterways, unlimited resources and eight starts
    When a mouse stroke paints water from (96.0, 212.0) to (112.0, 212.0)
    Then the editor has 5 painted terrain cells
    When the editor undoes the last edit
    Then the editor has 0 painted terrain cells
    When the editor redoes the last edit
    Then the editor has 5 painted terrain cells
    And the editor reports no validation issues
    When the editor saves the map to "user://frontier-authoring-proof.jsonld"
    And the editor playtests the map
    Then the engine plays the authored map with its painted terrain and unlimited deposits
    When the player returns to the editor
    And the editor undoes the last edit
    Then the editor has 0 painted terrain cells

  Scenario: A bucket fill is bounded, undoable and does not repaint an identical region
    Given the Map Editor is open with a new 64x64 map
    When the editor fills terrain at (12.0, 12.0) with "water"
    Then the editor has 256 painted terrain cells
    When the editor fills terrain at (12.0, 12.0) with "water"
    And the editor undoes the last edit
    Then the editor has 0 painted terrain cells

  Scenario: Invalid starting locations prevent playtesting until repaired
    Given the Frontier Hunters map is open in the editor
    When a starting location is moved into a waterway
    Then the editor blocks playtesting the invalid map
    When the editor undoes the last edit
    Then the editor reports no validation issues
