Feature: Order parts and keep stock
  The Orders menu keeps your suppliers, purchase orders and the parts you stock. Parts the mechanics ask for
  appear here, so whoever buys parts can order them or take them from the shelf.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Toyota Camry 2015"
    And "Toyota Camry 2015 — Sam Rivera" is taken in with the concern "Grinding noise when braking"
    And the supplier "NAPA Auto Parts" is on file

  Scenario: Add a supplier and a stock item
    Add the suppliers you buy from, then the parts you keep on the shelf, with a reorder point so you know
    when to buy more.
    Given I am at orders
    When I open the "Suppliers" orders tab
    Then the suppliers list "NAPA Auto Parts"
    When I open the "Stock" orders tab
    And I add the stock item "Front brake pads" with SKU "BP-100", 2 on hand, reorder at 2, ordering 4 at "30.00" from "NAPA Auto Parts"
    Then the stock item "Front brake pads" is marked low

  Scenario: Order a part a mechanic asked for
    Tick the request, choose the supplier and add it to an order. Place the order, then receive the
    delivery when it arrives. The part goes onto the repair ticket at the invoice cost.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I request 1 x "Front rotor"
    And I am at orders
    Then the mechanics asked for "Front rotor"
    When I order "Front rotor" from "NAPA Auto Parts" at "64.00"
    Then I am told "Added to PO-0001"
    When I place order "PO-0001" by "Phone" with supplier reference "N-55120"
    Then order "PO-0001" is "Placed with supplier"
    When I receive order "PO-0001" in full
    Then I am told "PO-0001 received in full"
    And order "PO-0001" is "Received"
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    Then a part request "Front rotor" is "received"

  Scenario: Running low turns into a draft order
    Items at or below their reorder point are listed with how many to order. One click adds them to a
    draft order for their usual supplier.
    Given the stock item "Front brake pads" has 1 on hand, reorder at 2, ordering 4 from "NAPA Auto Parts"
    And I am at orders
    Then the orders page shows "Running low (1)"
    When I add the low stock to draft orders
    Then order "PO-0001" is "Draft"

  Scenario: Take a requested part from stock
    If the part is on the shelf, take it from stock instead of ordering. Stock goes down and the part is on
    the ticket at its last cost.
    Given the stock item "Front brake pads" has 3 on hand, reorder at 1, ordering 4 from "NAPA Auto Parts"
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I request 1 x "Front brake pads"
    And I am at orders
    And I take "Front brake pads" from stock
    Then I am told "Front brake pads taken from stock for RO-0001"
    When I open the "Stock" orders tab
    Then the stock item "Front brake pads" shows "2 each"
