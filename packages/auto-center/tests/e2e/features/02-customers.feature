Feature: Add a customer
  Customers are the people who bring cars in. A customer can be linked to a RobOS user and to a RobOS
  group such as a fleet account, so permissions and notifications follow the same directory as the rest
  of RobOS.

  Scenario: Add a customer linked to a RobOS user and group
    Expand **Add a customer**, enter their contact details, then choose the matching RobOS user and, for
    fleet or business accounts, a RobOS group.
    When I add the customer "Priya Shah" linked to the RobOS user "Priya Shah" and the group "Fleet customers"
    Then the customer list shows "Priya Shah · RobOS user: Priya Shah · group: Fleet customers · 0 vehicle(s)"

  Scenario: Add a walk-in customer with only contact details
    A walk-in does not need a RobOS account. A name is enough; phone and email help you reach them about
    the estimate.
    When I add the customer "Sam Rivera" with phone "555-0100" and email "sam@example.com"
    Then the customer list shows "Sam Rivera · 555-0100 · sam@example.com"

  Scenario: An invalid email address is rejected
    The shop sends estimates and receipts by email, so a malformed address is caught at the front desk.
    When I add the customer "Sam Rivera" with the email "not-an-email"
    Then I am told "Enter a valid email address"
    And the customer list does not show "Sam Rivera"

  Scenario: The same customer is not created twice
    A second customer with the same email address is refused so every repair stays on one account.
    Given the customer "Sam Rivera" is on file
    When I add the customer "Sam Rivera" with phone "555-0100" and email "sam@example.com"
    And I add the customer "Samuel Rivera" with the email "sam@example.com"
    Then I am told "This customer already exists"
