Feature: Parts catalog and estimate suggestions
  Build the shop's own parts catalog one part at a time or by importing a supplier price list. Estimates and
  the parts-used form then suggest your parts first, with your supplier and price filled in, followed by a
  list of common part and labor names to start from.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"

  Scenario: Suggest common parts and labor jobs on an estimate
    Even with an empty catalog, estimate lines suggest common part names and standard jobs. Choosing a labor
    job fills in a typical number of hours to adjust.
    When I type "brake pa" into the "estimate part" field
    Then the suggestions include "Front brake pads"
    When I type "oil" into the "estimate labor" field
    And I choose the suggestion "Oil and filter change"
    Then the estimate labor line shows "0.5" hours

  Scenario: Your own parts come first, with supplier and price filled in
    Add a part with its part number, supplier, cost and price. When you quote a car, your part is suggested
    first and its customer price is filled in for you.
    Given I add the catalog part "Ceramic brake pads, front" number "BP-123" from "NAPA" costing "28.50" and selling for "59.99"
    When I type "brake pa" into the "estimate part" field
    Then the first suggestion is "Ceramic brake pads, front"
    When I choose the suggestion "Ceramic brake pads, front"
    Then the estimate part line shows price "59.99"

  Scenario: Parts that fit the vehicle are suggested first
    Note which make and model a part fits and it moves to the top of the list for matching cars.
    Given I add the catalog part "Honda brake pads, front" number "HP-1" from "NAPA" costing "30.00" and selling for "62.00", fitting a Honda Civic
    And I add the catalog part "Toyota brake pads, front" number "TP-1" from "NAPA" costing "31.00" and selling for "64.00", fitting a Toyota Camry
    When I type "brake pads" into the "estimate part" field
    Then the first suggestion is "Toyota brake pads, front"

  Scenario: Record parts used from the catalog
    Picking a catalog part in **Parts used** fills in your cost and supplier.
    Given I add the catalog part "Ceramic brake pads, front" number "BP-123" from "NAPA" costing "28.50" and selling for "59.99"
    And an estimate with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approved the estimate by phone
    When I type "ceramic" into the "part used" field
    And I choose the suggestion "Ceramic brake pads, front"
    Then the parts used form shows cost "28.50" and supplier "NAPA"

  Scenario: Import a supplier price list
    Paste or choose a CSV from your supplier. Only a name column is required; part number, supplier, cost,
    price, category, make, model and years are used when present. Parts already in the catalog are skipped.
    When I import this parts file:
      """
      Part Number,Name,Supplier,Cost,Price,Make,Model
      BP-200,"Brake pads, ceramic, rear",NAPA,22.00,49.00,Toyota,Camry
      OF-77,Oil filter,NAPA,3.10,8.99,,
      """
    Then I am told "Imported 2 part(s)"

  Scenario: A bad row stops the whole import
    Nothing is imported when a row has a problem, so you never end up with half a price list. The message
    names the row to fix.
    When I import this parts file:
      """
      Part Number,Name,Supplier,Cost,Price
      OK-1,Wiper blade,NAPA,4.00,9.00
      BAD-2,Cabin filter,NAPA,cheap,12.00
      """
    Then I am told "Nothing imported. Row 3: Cost must be an amount such as 12.50"
