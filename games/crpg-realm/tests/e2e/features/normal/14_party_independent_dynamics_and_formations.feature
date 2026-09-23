Feature: Player Character Independent Dynamics and Tactical Formations
  As a lead tactical commander in a party-based cRPG
  I want each party member to execute follow and movement commands independently based on the active leader's orders
  And I want the party leader to be interchangeable by selecting them in the portrait menu
  And I want the party to line up in ranks of tactical formations selectable from an icon-based menu bar

  Background:
    Given the cRPG game is running and healthy
    And the player loads a tactical party in "TacticalBattle"
    Then the party has 3 members and default leader is "Vance"
    And the active formation is "rank"
    And the formation icon toolbar is visible with buttons for "rank", "wedge", "line", "column", "square", "scatter"

  Scenario: Symmetrical follow dynamics with default leader Vance in Rank & File formation
    When the player commands the party to move to (600, 500)
    Then the active leader "Vance" moves directly to destination (600, 500)
    And companion "Elora" independently pathfinds to rank slot 1 in "rank" formation
    And companion "Thrumbar" independently pathfinds to rank slot 2 in "rank" formation
    And all party members arrive at their desired rank coordinates

  Scenario: Selecting Elora promotes her to party leader with crown badge and shifts camera
    When the player selects party member "Elora" as the active party leader
    Then the active party leader is "Elora"
    And the portrait toolbar displays the leader crown badge on "Elora"
    When the player commands the party to move to (800, 450)
    Then the active leader "Elora" moves directly to destination (800, 450)
    And protagonist "Vance" acts symmetrically as a follower and pathfinds to rank slot 1
    And companion "Thrumbar" pathfinds to rank slot 2 in "rank" formation
    And the camera smoothly tracks the active party leader

  Scenario: Selecting Wedge formation lines up party in V-shape spearhead
    When the player selects formation "wedge" from the action toolbar
    Then the active formation is "wedge"
    And the "wedge" formation icon is highlighted on the action toolbar
    When the player commands the party to move to (850, 600)
    Then the leader moves to (850, 600)
    And the followers align into rank coordinates forming a V-shape wedge

  Scenario: Selecting Shield Wall Line formation aligns party abreast
    When the player selects formation "line" from the action toolbar
    Then the active formation is "line"
    And the "line" formation icon is highlighted on the action toolbar
    When the player commands the party to move to (700, 700)
    Then the party members line up abreast perpendicular to the travel vector

  Scenario: Selecting Marching Column formation aligns party in single file
    When the player selects formation "column" from the action toolbar
    Then the active formation is "column"
    When the player commands the party to move to (500, 400)
    Then the party members align in a single-file column behind the leader

  Scenario: Switching leader to Thrumbar makes him lead in Defensive Square
    When the player selects formation "square" from the action toolbar
    And the player selects party member "Thrumbar" as the active party leader
    Then the active party leader is "Thrumbar"
    When the player commands the party to move to (650, 550)
    Then the active leader "Thrumbar" leads the party to (650, 550)
    And companions "Vance" and "Elora" position themselves at the defensive square rank coordinates
