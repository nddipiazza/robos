Feature: Diagnose and quote
  Record what the technician found, then send the customer an itemized estimate of parts and labor. Work
  does not start until the customer approves, and every version of the estimate is kept.

  Background:
    Given the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"

  Scenario: Record the diagnosis
    On the ticket, write up the findings and any trouble codes. The ticket moves to **Diagnosis** and the
    findings become part of its history.
    When I record the diagnosis "Front pads worn to the metal; rotors within spec" with the trouble code "C1234"
    Then the ticket is at "Diagnosis"
    And the ticket history includes "Front pads worn to the metal"

  Scenario: Send an itemized estimate
    Add each part and each labor line with its price. The estimate total is calculated for you and the
    ticket moves to **Estimate awaiting approval**.
    Given the diagnosis "Front pads worn to the metal" is recorded
    When I send an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    Then the ticket is at "Estimate awaiting approval"
    And the estimate shows "v1 · sent · $210.00"

  Scenario: An estimate line must have a description
    Customers approve what they can read, so every line needs a description.
    Given the diagnosis "Front pads worn to the metal" is recorded
    When I send an estimate with a blank line description
    Then I am told "Line description is required"

  Scenario: The customer approves the estimate
    Record who approved, and how: in person, by phone, email or text message. The ticket moves to **Repair
    in progress** and the approval is stamped on the ticket.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    When the customer approves the estimate by phone
    Then the ticket is at "Repair in progress"
    And the estimate shows "v1 · approved"
    And the ticket history includes "approved by Sam Rivera (phone)"

  Scenario: The customer declines, the shop revises, the customer approves
    If the customer declines, the ticket returns to diagnosis. Send a revised estimate and the previous
    version is marked superseded, so there is never any doubt which quote was approved.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Premium pads      | 1                 | 120.00 |
      | labor | Replace pads      | 1.5               | 100.00 |
    When the customer declines the estimate by email
    And I send an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Standard pads     | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approves the estimate by phone
    Then the ticket is at "Repair in progress"
    And the estimate shows "v2 · approved · $210.00"
