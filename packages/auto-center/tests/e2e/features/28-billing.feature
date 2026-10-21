Feature: Invoice, collect payment and hand the car back
  When the work is done, issue the invoice from the approved estimate, record each payment, and return
  the vehicle. The car cannot leave until the balance is paid.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Toyota Camry 2015"
    And "Toyota Camry 2015 — Sam Rivera" is taken in with the concern "Grinding noise when braking"
    And an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone
    And "Maria Lopez" logs "1.5" hours

  Scenario: Issue the invoice
    Click **Issue invoice** on the ticket. The total comes from the approved estimate and the ticket
    moves to **Invoiced, ready for collection**.
    When I issue the invoice
    Then the ticket is at "Invoiced, ready for collection"
    And the payment panel shows "Invoice $210.00 · paid $0.00 · balance $210.00"

  Scenario: The customer pays part now and the rest later
    Record every payment as it arrives. The balance updates after each one.
    Given I issue the invoice
    When the customer pays "100.00" by card
    Then the payment panel shows "paid $100.00 · balance $110.00"

  Scenario: The car cannot leave with a balance
    Returning the vehicle is blocked while any amount is unpaid.
    Given I issue the invoice
    When the customer pays "100.00" by cash
    And I return the vehicle to "Sam Rivera"
    Then I am told "The invoice still has a balance of 110.00 USD"

  Scenario: Pay in full and return the vehicle
    Once the balance is zero, hand the keys back and record who collected the car. The ticket closes, the
    vehicle leaves the shop floor and the payment is in the reports.
    Given I issue the invoice
    When the customer pays the remaining balance by card
    And I return the vehicle to "Sam Rivera"
    Then the ticket is at "Paid and offboarded"
    And the pipeline shows 1 at "Paid and offboarded"
    And the ticket history includes "Vehicle collected by Sam Rivera"
