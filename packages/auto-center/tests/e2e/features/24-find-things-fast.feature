Feature: Find makes, models, parts and codes as you type
  Start typing and Auto Center suggests matches from the imported vehicle catalog, your parts catalog, a
  list of common parts and labor jobs, and trouble-code definitions. Suggestions never get in the way:
  anything you type is accepted even when it is not in the list.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file

  Scenario: Suggest makes as you type
    Open **Add a customer vehicle** and start typing in **Make**. Matching makes appear straight away
    and the list narrows with every letter.
    When I type "toy" into the "vehicle make" field
    Then the suggestions include "Toyota"
    And the suggestions do not include "Honda"

  Scenario: Models narrow to the chosen make
    Once a make is chosen, **Model** only offers that make's models, so a Toyota never ends up as a
    Civic by accident.
    When I type "toy" into the "vehicle make" field
    And I choose the suggestion "Toyota"
    And I type "c" into the "vehicle model" field
    Then the suggestions include "Camry"
    And the suggestions include "Corolla"
    And the suggestions do not include "Civic"

  Scenario: Pick a year the model was actually sold
    **Year** offers the model years that exist for the chosen make and model, newest first.
    Given I type "toy" into the "vehicle make" field
    And I choose the suggestion "Toyota"
    And I type "cam" into the "vehicle model" field
    And I choose the suggestion "Camry"
    When I click the "vehicle year" field
    Then the first suggestion is "2016"
    And the suggestions include "2014"

  Scenario: Find a vehicle by year, make and model in one go
    Type the whole thing, such as "2015 honda", into **Find year, make and model**. Picking a result fills
    in year, make and model and suggests a vehicle name.
    When I type "2015 honda" into the "vehicle search" field
    And I choose the suggestion "2015 Honda Civic"
    Then the vehicle form shows year "2015", make "Honda" and model "Civic"

  Scenario: Choose a suggestion with the keyboard
    Use the arrow keys to move through suggestions and Enter to choose one, so you never need the mouse.
    When I type "ford" into the "vehicle make" field
    And I press ArrowDown
    And I press Enter
    Then the field shows "Ford"

  Scenario: A vehicle that is not in the catalog can still be added
    The catalog covers vehicles sold in the US market. For anything else, such as a classic or an import,
    just type it in.
    When I add the vehicle "Grandpa's Studebaker" for "Sam Rivera" with the free-text make "Studebaker" and model "Lark"
    Then the customer list shows "Sam Rivera · 1 vehicle(s)"

  Scenario: Look up trouble codes by number or by description
    In **Diagnosis**, type a code such as P03 or a symptom such as "misfire". Choosing a suggestion adds the
    code, and you can add several.
    Given the customer "Priya Shah" is on file
    And "Priya Shah" has the vehicle "Priya's Camry"
    And "Priya's Camry" is taken in with the concern "Engine shakes at idle"
    When I type "mis" into the "trouble codes" field
    Then the suggestions include "P0300"
    And the suggestions include "Cylinder 1 Misfire Detected"

  Scenario: Pick the customer's vehicle when taking a car in
    Start typing the customer's name, the vehicle or the plate to find the car on file.
    Given "Sam Rivera" has the vehicle "Sam's Camry"
    When I type "sam" into the "intake vehicle" field
    Then the suggestions include "Sam's Camry"
