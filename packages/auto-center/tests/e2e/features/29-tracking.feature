Feature: Every repair is tracked from start to finish
  Each repair has a ticket number such as RO-0001. Every stage change, estimate, approval, part and block of
  hours is added to the ticket and backed up to storage such as GitHub, so a crashed computer never costs you a customer's history and you can answer
  "what happened to this car?" months later.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"

  Scenario: The ticket history lists each step in order
    Open **Ticket history** on the ticket to see a timeline of what happened, newest first.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    When the customer approves the estimate by phone
    And "Maria Lopez" logs "1.5" hours
    Then the ticket history includes "Estimate v1 sent"
    And the ticket history includes "Estimate v1 approved by Sam Rivera (phone)"
    And the ticket history includes "Maria Lopez 1.5h"

  Scenario: Every step is backed up
    Every step is backed up with the ticket number in its label. Point the backup at GitHub or any other
    Git hosting and your whole shop history survives a lost or broken computer.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    When the customer approves the estimate by phone
    Then the backup history contains "RO-0001: estimate v1 sent"
    And the backup history contains "RO-0001: estimate approved"

  Scenario: Tickets survive closing and reopening the app
    The ticket lives in the private shop graph, not in the window, so a restart loses nothing.
    When I reload the app
    Then a repair ticket "RO-0001" is open at "Intake"
