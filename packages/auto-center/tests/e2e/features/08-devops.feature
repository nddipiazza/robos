Feature: Every repair is tracked as a DevOps work item
  Each repair has a ticket key such as RO-0001. Every stage change, estimate, approval, part and block of
  hours is appended to the ticket and committed to the shop's private Git history, so you can answer
  "what happened to this car?" months later.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"

  Scenario: The ticket history lists each step in order
    Open **DevOps ticket history** on the ticket to see a timeline of what happened, newest first.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    When the customer approves the estimate by phone
    And "Maria Lopez" logs "1.5" hours
    Then the ticket history includes "Estimate v1 sent"
    And the ticket history includes "Estimate v1 approved by Sam Rivera (phone)"
    And the ticket history includes "Maria Lopez 1.5h"

  Scenario: Each stage is a Git commit
    The shop Git repository gets one commit per stage change, titled with the ticket key, so ordinary
    Git tools can show the full audit trail or sync it to a remote.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    When the customer approves the estimate by phone
    Then the shop Git history contains "RO-0001: estimate v1 sent"
    And the shop Git history contains "RO-0001: estimate approved"

  Scenario: Tickets survive closing and reopening the app
    The ticket lives in the private shop graph, not in the window, so a restart loses nothing.
    When I reload the app
    Then a repair ticket "RO-0001" is open at "Intake"
