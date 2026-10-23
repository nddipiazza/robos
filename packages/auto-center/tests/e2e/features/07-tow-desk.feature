Feature: Run the tow desk
  The Tow desk takes tow and roadside calls, quotes them from your rate card, sends a truck and driver, and
  follows each call until the vehicle is dropped off. Tow invoices and payments go through Checkout.

  Background:
    Given the shop offers "We do towing"
    And the shop team has "Dana Wells" as "Tow driver"
    And I add the customer "Jim Parker" with phone "555-0142" and email "jim@example.com"
    And "Jim Parker" has the vehicle "Honda Accord 2005"
    And the tow desk has the truck "Truck 1" as a "Flatbed (rollback)"
    And the tow desk has the truck "Truck 2" as a "Wheel-lift"
    And the tow rates are hook-up "95.00", per mile "4.50" after "5" miles, roadside "75.00"

  Scenario: Set up your trucks and tow rates
    Under **Admin → Tow trucks**, add each truck with its type and enter the rates you charge. Quotes on the
    phone and tow invoices both use them.
    Given I am in the shop admin
    When I open the "Tow trucks" tab
    Then the tow trucks list "Truck 1"
    And the tow trucks list "Truck 2"

  Scenario: A stranded driver calls for a tow
    Find the caller, pick the vehicle, choose **Tow** and answer the questions. Enter where the vehicle is and
    where it is going, and read the quote back to the caller before you take the call.
    Given I am at the tow desk
    When I take a tow call
    And the caller is the existing customer "Jim Parker" found by "5550142"
    And I go on at the tow desk
    And I choose the vehicle "Honda Accord 2005 — Jim Parker" at the tow desk
    And I go on at the tow desk
    And the caller needs "Tow"
    And I answer the tow question "Why does it need a tow" with "Broke down"
    And I answer the tow question "Do all four wheels" with "Yes"
    And I answer the tow question "all-wheel" with "No, two-wheel drive"
    And I answer the tow question "Where is the vehicle right now" with "Road shoulder or busy street"
    And I go on at the tow desk
    And the vehicle is at "Route 9 northbound, mile marker 14"
    And it is going to "Our shop" about "12" miles away
    And I go on at the tow desk
    And it is not an after-hours call
    Then the quote is "$126.50"
    When I take the call
    Then the tow desk says "TW-0001 is waiting for a truck"

  Scenario: An all-wheel-drive car needs a flatbed
    A wheel-lift tows a car on two wheels, which damages all-wheel-drive and electric drivetrains. The
    tow desk says which truck the call needs and will not send one that cannot carry the vehicle.
    Given a tow call for the all-wheel-drive "Honda Accord 2005 — Jim Parker" is taken at "Kroger parking lot, Main St"
    When I dispatch "Truck 2" with "Dana Wells" arriving in "20" minutes
    Then I am told "needs a flatbed"
    When I dispatch "Truck 1" with "Dana Wells" arriving in "20" minutes
    Then tow "TW-0001" is under "On the road"
    And the truck "Truck 1" shows "Out on TW-0001"

  Scenario: Follow the truck to the drop-off
    Record each step as the driver reports in. Note any damage before the vehicle goes on the truck. When
    it is dropped at your shop or yard it is checked in automatically.
    Given a tow call for "Honda Accord 2005 — Jim Parker" is taken at "Route 9 northbound, mile marker 14"
    When I dispatch "Truck 2" with "Dana Wells" arriving in "25" minutes
    And the driver is at the vehicle
    And the driver notes "Scuff on the rear bumper, already there" and loads the vehicle
    And the vehicle is dropped off after "13" miles at "Lot B"
    Then I am told "dropped off and checked in"
    And tow "TW-0001" is under "Ready to bill"

  Scenario: Bill the tow at checkout
    The invoice uses the rates quoted on the call and the miles actually driven. Take payment as usual,
    then close the call.
    Given a tow call for "Honda Accord 2005 — Jim Parker" is taken at "Route 9 northbound, mile marker 14"
    When I dispatch "Truck 2" with "Dana Wells" arriving in "25" minutes
    And the driver is at the vehicle
    And the driver notes "No visible damage" and loads the vehicle
    And the vehicle is dropped off after "13" miles at "Lot B"
    And I invoice the tow at checkout
    Then checkout shows "Loaded miles"
    When I issue the tow invoice
    Then checkout shows "Take payment"
    When the customer pays the balance by card at checkout
    And I continue at checkout
    And I close the tow call
    Then checkout shows "TW-0001 is closed"

  Scenario: A jump start billed to a motor club
    Roadside calls (jump start, lockout, flat tire, fuel, winch-out) are charged at your roadside rate.
    If a motor club or insurer pays, record their name and authorization number on the call.
    Given I am at the tow desk
    When I take a tow call
    And the caller is the existing customer "Jim Parker" found by "jim"
    And I go on at the tow desk
    And I choose the vehicle "Honda Accord 2005 — Jim Parker" at the tow desk
    And I go on at the tow desk
    And the caller needs "Jump start"
    And I answer the tow question "turn the key" with "Clicking"
    And I go on at the tow desk
    And the vehicle is at "14 Elm St, in the driveway"
    And the motor club "AAA" pays with authorization "AAA-7731"
    And I go on at the tow desk
    And it is not an after-hours call
    Then the quote is "$75.00"
    When I take the call
    Then the tow desk says "TW-0001 is waiting for a truck"

  Scenario: A car that cannot be driven comes in on our tow truck
    If the customer says the car needs to be towed, the Front desk can send your truck. The tow call opens
    with the repair ticket, and the car is checked in when the truck drops it off.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550142"
    And I pick "Jim Parker" from the matches
    And I continue
    And I choose the vehicle "Honda Accord 2005 — Jim Parker"
    And I continue
    And I choose the problem "Engine, starting or check-engine light"
    And I answer "Is the car safe to drive" with "No, it needs to be towed"
    And I continue
    And I send our tow truck from "88 Oak Ave, in the driveway"
    And I open the ticket
    Then ticket "RO-0001" is open
    When I dispatch the tow truck from the front desk
    Then tow "TW-0001" is under "Waiting for a truck"
