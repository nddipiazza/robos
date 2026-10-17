Feature: Work the ticket at the mechanic bench
  The Mechanic bench shows what is on your plate. Open a ticket to see what the customer told the front
  desk, then request parts, log your time and finish the job. Everything you do is saved on the ticket.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the shop team has "Dan Okafor" as "Technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"

  Scenario: Pick your name and take a ticket
    Choose who you are, open a ticket nobody has taken, and press **Take this ticket**. It moves to **My
    tickets** and your name goes on it.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    Then I am greeted as "Maria"
    And "Open tickets nobody has taken" lists "RO-0001"
    When I open the work ticket "RO-0001"
    And I take this ticket
    Then the bench shows "Waiting for diagnosis · Maria Lopez"
    Given I am at the mechanic bench
    Then "My tickets" lists "RO-0001"

  Scenario: See what the customer told the front desk
    The ticket shows the answers from the intake form, so you know about warning lights, when it happens and
    whether the car is safe to drive before you touch it.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "sam riv"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I add another vehicle
    And I enter the vehicle year "2012", make "Honda" and model "Accord"
    And I continue
    And I choose the problem "Noise or vibration"
    And I answer "What does it sound or feel like" with "Clunk or knock"
    And I answer "When does it happen" with "Over bumps"
    And I continue
    And I open the ticket
    And I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0002"
    Then the bench shows "What the customer told us"
    And the bench shows "Clunk or knock"
    And the bench shows "Over bumps"

  Scenario: Record what you found
    Write up the diagnosis from the bench. The ticket moves to **Being diagnosed**.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I record the diagnosis "Front pads worn to the metal; rotors in spec" at the bench
    Then the bench shows "Being diagnosed"
    And the bench history includes "diagnosing"

  Scenario: Request a part
    Start typing the part, say how soon you need it, and send the request. The front desk and parts desk
    see it straight away.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I request 1 x "Front brake pads" urgently
    Then a part request "Front brake pads" is "requested"
    And the bench history includes "asked for 1 × Front brake pads (urgent)"

  Scenario: Order and receive the part
    The parts desk marks the request **ordered** with the supplier, then **received** with what it cost. A
    received part is added to the ticket's parts cost automatically.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I request 1 x "Front brake pads"
    And I mark the part "Front brake pads" as ordered from "NAPA"
    Then a part request "Front brake pads" is "ordered"
    When I mark the part "Front brake pads" as received costing "28.50"
    Then a part request "Front brake pads" is "received"
    And the bench history includes "1 × Front brake pads received"

  Scenario: Log your hours
    Enter the hours you worked. The ticket adds them up for each teammate.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I record the diagnosis "Pads worn" at the bench
    And I log "1.5" hours at the bench
    Then the bench shows "Maria Lopez: 1.5 h"

  Scenario: Time the job with a stopwatch
    Press **Start timer** when you begin and **Stop timer** when you finish. The time is rounded to the
    nearest minute and added to the ticket.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I record the diagnosis "Pads worn" at the bench
    And I start the timer
    Then the bench shows "Timer running"
    When I let it run for a moment and stop the timer
    Then the bench history includes "(timed)"

  Scenario: Unrealistic hours are refused
    A single entry cannot be more than 24 hours.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I record the diagnosis "Pads worn" at the bench
    And I log "30" hours at the bench
    Then I am told "Hours must be more than 0 and at most 24 per entry"

  Scenario: Add notes as you go
    Notes about what you found or did are saved on the ticket for the front desk and the next mechanic.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I add the finding "Right front rotor has a lip, recommend replacing"
    Then the bench history includes "Right front rotor has a lip"

  Scenario: Tell the front desk you found more work
    **Found more work** sends a note to the front desk, who contact the customer for approval before the
    extra work is done.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I flag more work: "Rotors are below minimum thickness"
    And I am at the front desk
    Then the front desk lists "RO-0001" under "Mechanic recommends more work"

  Scenario: A job cannot be finished while a part is still on order
    You cannot finish until every requested part has arrived or been cancelled.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I request 1 x "Front brake pads"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the pads"
    Then I am told "Parts are still on order for this ticket"

  Scenario: A job cannot be finished with the timer running
    Stop the timer first so the hours are counted.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I start the timer
    And I finish the job: "Replaced the pads"
    Then I am told "Stop the running timer before finishing the job"

  Scenario: Finish the job and hand it to checkout
    Add a short summary and press **Mark work complete**. The car now appears at Checkout.
    Given an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads and bedded them in"
    And I am at checkout
    Then checkout lists "RO-0001"

  Scenario: Switch to another mechanic
    Several people can share one computer. Press **Switch** to change who is at the bench.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I switch to "Dan Okafor"
    Then I am greeted as "Dan"
