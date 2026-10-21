Feature: Take the customer's call at the front desk
  The Front desk menu walks you through an intake in five steps: how they reached us, who they are, which
  vehicle, what is wrong, and a final check. It works the same whether they phone, text, email or walk in.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And I add the customer "Sam Rivera" with phone "555-0100" and email "sam@example.com"
    And "Sam Rivera" has the vehicle "Toyota Camry 2015"

  Scenario: A new customer phones in
    Choose how they reached you, then **New customer** and take their name and phone number. Add a vehicle
    by typing the year, make and model, then answer the questions about the problem.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose a new customer named "Priya Shah" with phone "(555) 010-0199"
    And I continue
    And I add a vehicle by searching "2015 honda" and choosing "2015 Honda Civic"
    And I continue
    And I choose the problem "Brakes"
    And I answer "brake problem feel" with "Grinding"
    And I answer "When does it happen" with "Every time I brake"
    And I continue
    Then the summary shows "Priya Shah · (555) 010-0199"
    And the summary shows "Honda Civic 2015"
    And the summary shows "Grinding"
    When I open the ticket
    Then ticket "RO-0001" is open

  Scenario: An existing customer is found by phone number
    Choose **Existing customer** and type any part of their phone number. Their saved vehicles appear so you
    can pick the car they are calling about.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550100"
    Then the matches show "Sam Rivera"
    When I pick "Sam Rivera" from the matches
    And I continue
    And I choose the vehicle "Toyota Camry 2015 — Sam Rivera"
    And I continue
    Then the step is "Issue"

  Scenario: An existing customer is found by email
    Typing an email address finds the customer too.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "email"
    And I choose the existing customer "sam@example"
    Then the matches show "Sam Rivera"

  Scenario: An existing customer is found by name
    Type the first letters of their name. Matching customers appear after three letters.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "walk-in"
    And I choose the existing customer "sam riv"
    Then the matches show "555-0100"

  Scenario: Add another vehicle for an existing customer
    If the car is not on file, choose **Another vehicle** and enter its year, make and model.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "sam riv"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I add another vehicle
    And I enter the vehicle year "2018", make "Ford" and model "F-150"
    And I continue
    Then the step is "Issue"

  Scenario: A customer texts in and prefers text messages
    Record how they like to be contacted so the next person replies the way the customer wants.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "text message"
    And I choose a new customer named "Chris Park" with phone "(555) 010-0155"
    And I give their email "chris@example.com" and prefer "text message"
    And I continue
    Then the step is "Vehicle"

  Scenario: A walk-in who only has an email address
    A phone number is best, but an email address is enough to reach the customer.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "walk-in"
    And I choose a new customer named "Lee Wong" with only the email "lee@example.com"
    And I continue
    Then the step is "Vehicle"

  Scenario: A new customer needs a phone number or an email
    Without a way to reach them we cannot send the estimate, so the wizard asks for one.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "walk-in"
    And I choose a new customer named "Alex Day" with no contact details
    And I continue
    Then I am asked to "Add a phone number or an email"

  Scenario: An unknown customer can be added straight from the search
    A search that finds nobody can turn what you typed into a new customer with one click.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "555 777 1234"
    Then the notice offers "Add as a new customer"
    When I accept the offer to "Add as a new customer"
    Then the phone field shows "555 777 1234"

  Scenario: The vehicle year, make and model are required
    We always record exactly which car we are looking at.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose a new customer named "Priya Shah" with phone "(555) 010-0199"
    And I continue
    And I continue
    Then I am asked to "Enter the year, make and model"

  Scenario: A car that already has an open ticket cannot be taken in twice
    The wizard shows which ticket the car is already on so nothing is duplicated.
    Given "Toyota Camry 2015 — Sam Rivera" is taken in with the concern "Grinding noise when braking"
    And I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550100"
    And I pick "Sam Rivera" from the matches
    And I continue
    Then the vehicle choice "Toyota Camry 2015 — Sam Rivera" is unavailable

  Scenario: Questions about the problem come from the knowledge graph
    Each problem type has its own questions, so the mechanic gets the details before touching the car. The
    list of problems and questions lives in the shop's knowledge graph.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550100"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I choose the vehicle "Toyota Camry 2015 — Sam Rivera"
    And I continue
    And I choose the problem "Engine, starting or check-engine light"
    And I answer "What is the engine doing" with "Rough idle or shaking"
    And I answer "Is the check-engine light flashing" with "Flashing"
    And I answer "Which warning lights are on" with "Check engine"
    And I add the customer's words "Shakes at red lights, worse when warm"
    And I continue
    Then the summary shows "Rough idle or shaking"
    And the summary shows "Flashing"
    And the summary shows "Shakes at red lights"

  Scenario: Routine service takes several choices
    For an oil change or inspection, tick every service the customer wants.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550100"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I choose the vehicle "Toyota Camry 2015 — Sam Rivera"
    And I continue
    And I choose the problem "Routine service or inspection"
    And I answer "Which services do you need" with "Oil and filter change"
    And I answer "Which services do you need" with "Tire rotation"
    And I continue
    Then the summary shows "Oil and filter change, Tire rotation"

  Scenario: Unsafe cars are flagged urgent
    If the customer says the car is unsafe or must be towed, the ticket is marked **Urgent** and shown
    first to the mechanics.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550100"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I choose the vehicle "Toyota Camry 2015 — Sam Rivera"
    And I continue
    And I choose the problem "Brakes"
    And I answer "How urgent is it" with "Emergency or unsafe"
    And I continue
    And I open the ticket
    Then the ticket is marked urgent

  Scenario: A problem must be chosen
    Without knowing what is wrong we cannot open a useful ticket.
    Given I am at the front desk
    When I start an intake
    And the customer reached us by "phone call"
    And I choose the existing customer "5550100"
    And I pick "Sam Rivera" from the matches
    And I continue
    And I choose the vehicle "Toyota Camry 2015 — Sam Rivera"
    And I continue
    And I continue
    Then I am asked to "Choose what the problem is about"

  Scenario: Log a call, text or email about a ticket
    Record every conversation on the ticket so anyone can see who said what and when.
    Given "Toyota Camry 2015 — Sam Rivera" is taken in with the concern "Grinding noise when braking"
    And I am at the front desk
    When I find the ticket "RO-0001" to log a conversation
    And I log that "we contacted them" by "text message": "Texted the estimate and asked for approval"
    Then the front desk ticket history includes "We contacted the customer by text message"

  Scenario: Prepare the estimate and record approval from the front desk
    Open the ticket from **Estimates to prepare**, itemize parts and labor, then record how the customer
    approved: in person, phone, email or text.
    Given "Toyota Camry 2015 — Sam Rivera" is taken in with the concern "Grinding noise when braking"
    And I am at the front desk
    Then the front desk lists "RO-0001" under "Estimates to prepare"
    When I open ticket "RO-0001" from the front desk list
    And I prepare an estimate at the front desk with:
      | type  | description       | quantity_or_hours | price  |
      | part  | Front brake pads  | 1                 | 60.00  |
      | labor | Replace pads      | 1.5               | 100.00 |
    And the customer approves the estimate by "Text message" at the front desk
    Then the front desk ticket history includes "approved by Sam Rivera (text message)"
