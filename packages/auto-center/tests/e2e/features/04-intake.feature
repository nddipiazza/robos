Feature: Take the car in
  Taking a car in opens a repair ticket (a DevOps work item such as RO-0001) and checks the vehicle onto
  the shop floor. From here every stage change is recorded on the ticket and committed to the shop's
  private Git history.

  Background:
    Given the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"

  Scenario: Take in a car and open a repair ticket
    Expand **Take in a car and open a repair**, choose the vehicle and describe the customer's concern in
    their own words. Add the odometer reading and parking bay so the car is easy to find.
    When I take in "Sam's Camry" with the concern "Grinding noise when braking", odometer "84000" and parking bay "Bay 2"
    Then a repair ticket "RO-0001" is open at "Intake"
    And the pipeline shows 1 at "Intake"
    And "Sam's Camry" is on the shop floor

  Scenario: A car cannot have two open repairs
    One open ticket per vehicle keeps the work, parts and hours together. Finish or close the existing
    ticket before opening a new one.
    Given "Sam's Camry" is taken in with the concern "Grinding noise when braking"
    When I take in "Sam's Camry" with the concern "Also needs an oil change"
    Then I am told "This vehicle already has an open repair"

  Scenario: The ticket is saved to the shop's Git history
    Opening the ticket is committed with its key, so the shop has an audit trail from the first minute.
    When I take in "Sam's Camry" with the concern "Grinding noise when braking"
    Then the shop Git history contains "RO-0001: vehicle received"
