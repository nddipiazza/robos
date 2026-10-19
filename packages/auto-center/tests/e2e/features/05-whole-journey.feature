Feature: One whole repair, using the four menus
  This is the whole story in one run: the owner sets up the team, the front desk takes a call and
  prepares the estimate, the mechanic does the work, and checkout takes payment and hands back the keys.

  Scenario: A complete repair using the four menus
    Watch the recording to see a car go from the first phone call to the keys going back, using the Admin,
    Front desk, Mechanic bench and Checkout menus.
    Given I am in the shop admin
    When I add the team member "Maria Lopez" as "Master technician" linked to "Maria Lopez" with a cost of "32.00"
    And I am at the front desk
    And I start an intake
    And the customer reached us by "phone call"
    And I choose a new customer named "Sam Rivera" with phone "(555) 010-0100"
    And I continue
    And I add a vehicle by searching "2015 toyota" and choosing "2015 Toyota Camry"
    And I continue
    And I choose the problem "Brakes"
    And I answer "brake problem feel" with "Grinding"
    And I answer "When does it happen" with "Every time I brake"
    And I continue
    And I open the ticket
    Then ticket "RO-0001" is open
    When I choose to prepare the estimate
    And I prepare an estimate at the front desk with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approves the estimate by "Phone" at the front desk
    And I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I take this ticket
    And I request 1 x "Front brake pads"
    And I mark the part "Front brake pads" as ordered from "NAPA"
    And I mark the part "Front brake pads" as received costing "28.50"
    And I log "1.5" hours at the bench
    And I finish the job: "Replaced the front pads and bedded them in"
    And I am at checkout
    And I check out ticket "RO-0001"
    And I issue the invoice at checkout
    And the customer pays "100.00" by card at checkout
    And the customer pays the balance by cash at checkout
    And I continue at checkout
    And I hand over the keys to "Sam Rivera"
    Then checkout shows "RO-0001 is closed"
