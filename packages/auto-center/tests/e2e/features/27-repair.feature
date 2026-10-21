Feature: Fix the car
  Once the customer has approved, record the parts you actually use and the hours each teammate spends.
  These feed the invoice and the shop's profit reports.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the shop team has "Dan Okafor" as "Technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Toyota Camry 2015"
    And "Toyota Camry 2015 — Sam Rivera" is taken in with the concern "Grinding noise when braking"
    And an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 3                 | 100.00 |
    And the customer approved the estimate by phone

  Scenario: Record the parts used
    Enter each part with its quantity and what it cost you. Part cost is tracked against the estimate so
    you can see your margin.
    When I record 1 x "Front brake pads" costing "35.00" each
    Then the ticket shows "parts cost $35.00"
    And the ticket history includes "1 × Front brake pads"

  Scenario: Track hours for each teammate
    Several technicians can work on one repair. Choose the teammate and log their time; the ticket totals
    hours per person.
    When "Maria Lopez" logs "2" hours
    And "Dan Okafor" logs "1" hours
    Then the ticket shows "Maria Lopez 2h"
    And the ticket shows "Dan Okafor 1h"

  Scenario: Unrealistic hours are rejected
    A single entry cannot exceed 24 hours, and a teammate cannot log more than 24 hours on one day.
    When "Maria Lopez" logs "30" hours
    Then I am told "Hours must be more than 0 and at most 24 per entry"

  Scenario: An invoice needs logged hours
    The invoice is built from the approved estimate and the hours actually worked. Log time before you
    issue it.
    When I issue the invoice
    Then I am told "Log the hours worked before invoicing"
