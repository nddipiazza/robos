Feature: Choose the services your shop offers
  Each service is a plugin. Tick the ones you offer under Admin → Services, and each adds its own menus,
  questions and billing. Auto repair is on for a new shop.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Toyota Camry 2015"

  Scenario: See what your shop offers
    Ready services have their own screens. Starters add their questions and labor to the repair desk.
    Planned ones show what they will do.
    Given I am in the shop admin
    When I open the "Services" tab
    Then "We do auto repair" is ticked
    And "We do towing" is not ticked
    And "We sell used cars" cannot be ticked yet

  Scenario: Turn on tires and take a tire call
    A starter service adds its problem type and questions to the Front desk intake.
    Given the shop offers "We do tires"
    And I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "sam riv"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I choose the vehicle "Toyota Camry 2015 — Sam Rivera"
    And I continue
    And I choose the problem "Tires"
    And I answer "What do they need" with "New tires"
    And I answer "How many tires" with "Four"
    And I continue
    Then the summary shows "New tires"
    And the summary shows "Four"

  Scenario: Turn off a service you do not offer
    Its menu disappears. Its records are kept, and it comes back when you turn it on again.
    Given the shop offers "We do towing"
    Then the menu shows "Tow desk"
    When I stop offering "We do towing"
    Then the menu does not show "Tow desk"

  Scenario: Sell parts at the counter with RobOS Point of Sale
    The parts counter is RobOS Point of Sale. It opens in its own window, with the register, back office and
    barcode scanning.
    Given the shop offers "We do auto parts sales"
    And I am at the parts counter
    When I open the parts counter register
    Then the register window shows "Point of Sale"
    When I load the "retail" sample in the register
    And I am at the parts counter
    Then the parts counter shows "Counter items"
