Feature: From first call to a paid, returned car
  The whole customer journey in one run: add the team and customer, take the car in, diagnose, quote,
  get approval, repair, invoice, collect payment and offboard the vehicle.

  Scenario: A brake job from walk-in to offboard
    This is the complete lifecycle a local shop follows for every car. Watch the recording to see each
    stage of the ticket light up in the progress bar.
    Given the shop team has "Maria Lopez" as "Master technician" linked to the RobOS person "Maria Lopez"
    And the shop team has "Dan Okafor" as "Technician" linked to the RobOS person "Dan Okafor"
    When I add the customer "Sam Rivera" linked to the RobOS user "Sam Rivera" and the group "Fleet customers"
    And I add the vehicle "Sam's Camry" for "Sam Rivera" — a 2015 Toyota Camry
    And I take in "Sam's Camry" with the concern "Grinding noise when braking", odometer "84000" and parking bay "Bay 2"
    And I record the diagnosis "Front pads worn to the metal" with the trouble code "C1234"
    And I send an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 3                 | 100.00 |
    And the customer approves the estimate by phone
    And I record 1 x "Front brake pads" costing "35.00" each
    And "Maria Lopez" logs "2" hours
    And "Dan Okafor" logs "1" hours
    And I issue the invoice
    And the customer pays "100.00" by card
    And the customer pays the remaining balance by cash
    And I return the vehicle to "Sam Rivera"
    Then the ticket is at "Paid and offboarded"
    And the ticket history includes "Vehicle collected by Sam Rivera"
    And the shop Git history contains "RO-0001: vehicle returned, repair closed"
