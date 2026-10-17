Feature: Check the customer out
  Checkout walks you through the end of the visit in four steps: pick the finished car, issue the invoice,
  take payment and hand back the keys. The ticket closes when the customer drives away.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"
    And an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone

  Scenario: Only finished cars are ready for checkout
    A car appears here once the mechanic marks the job complete. Cars still being worked on are listed
    separately so you can tell the customer how long to wait.
    Given I am at checkout
    Then checkout does not list "RO-0001"
    And checkout shows "Still being worked on (1)"

  Scenario: Issue the invoice from the approved estimate
    Pick the car and review the approved estimate, the hours worked and the parts used before you invoice.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads"
    And I am at checkout
    And I check out ticket "RO-0001"
    Then checkout shows "Front brake pads"
    And checkout shows "Approved estimate"
    When I issue the invoice at checkout
    Then checkout shows "Take payment"
    And checkout shows "$210.00"

  Scenario: Charges well above the estimate need the customer's approval first
    You can add a small extra charge, but more than 10% over the approved estimate needs a new approval
    from the customer.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads"
    And I am at checkout
    And I check out ticket "RO-0001"
    And I issue the invoice with extra charges of "80.00"
    Then I am told "need a new customer approval"

  Scenario: Take payment in more than one go
    Record each payment as it arrives. The balance goes down every time.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads"
    And I am at checkout
    And I check out ticket "RO-0001"
    And I issue the invoice at checkout
    And the customer pays "100.00" by card at checkout
    Then checkout shows "$110.00"

  Scenario: The customer cannot leave with a balance
    The wizard will not move on to hand-back while any amount is still owed.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads"
    And I am at checkout
    And I check out ticket "RO-0001"
    And I issue the invoice at checkout
    And the customer pays "100.00" by cash at checkout
    And I continue at checkout
    Then I am told "There is still $110.00 to pay"

  Scenario: Pay in full, hand over the keys and close the ticket
    Once the balance is zero, record who collected the car. The ticket is complete and the vehicle leaves
    the shop floor.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads"
    And I am at checkout
    And I check out ticket "RO-0001"
    And I issue the invoice at checkout
    And the customer pays "100.00" by card at checkout
    And the customer pays the balance by cash at checkout
    And I continue at checkout
    And I hand over the keys to "Sam Rivera"
    Then checkout shows "RO-0001 is closed"
