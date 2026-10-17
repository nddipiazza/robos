Feature: Set up the shop (owner admin)
  The Admin menu is for the shop owner. Add and manage the team, keep the parts catalog, review the
  questions the front desk asks about every problem, set the shop's details and connect backups.

  Scenario: Add a team member linked to RobOS
    Open **Admin**, then **Team**. Enter a name and role, pick the person from RobOS People and, if you
    like, their hourly labor cost. The cost feeds your profit reports.
    Given I am in the shop admin
    When I add the team member "Maria Lopez" as "Master technician" linked to "Maria Lopez" with a cost of "32.00"
    Then the team shows "Maria Lopez"
    And the team shows "Master technician · RobOS: Maria Lopez · cost 32.00 per hour"

  Scenario: Change a team member's role and hourly cost
    Click **Edit** next to a person, change their role or cost and save. Past hours keep the cost they
    were logged at.
    Given the shop team has "Dan Okafor" as "Technician"
    And I am in the shop admin
    When I change the role of "Dan Okafor" to "Senior technician" and the cost to "28.50"
    Then the team shows "Senior technician · cost 28.50 per hour"

  Scenario: Deactivate someone who has left
    A deactivated team member disappears from the mechanic bench list but their past hours stay on the
    tickets. You can reactivate them later.
    Given the shop team has "Dan Okafor" as "Technician"
    And I am in the shop admin
    When I deactivate "Dan Okafor"
    Then the team shows "Inactive"
    When I sit down at the bench as "Dan Okafor"
    Then the bench shows "no one on the team yet"

  Scenario: You cannot deactivate someone who still has open work
    Finish or hand over their tickets first, so no customer's car is left without an owner.
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Camry"
    And "Sam's Camry" is taken in with the concern "Grinding noise when braking"
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I take this ticket
    And I am in the shop admin
    And I deactivate "Maria Lopez"
    Then I am told "is assigned to 1 open ticket(s)"

  Scenario: Save the shop's details
    Enter the shop name, phone, currency and your usual hourly labor rate.
    Given I am in the shop admin
    When I open the "Shop settings" tab
    And I save the shop settings "Lopez Auto Repair", phone "555-0111", currency "USD" and rate "110.00"
    Then the settings show the shop name "Lopez Auto Repair"

  Scenario: Add a part to the catalog and find it again
    Add a part with its number, supplier, cost and price, then search the catalog to confirm it is there.
    Given I am in the shop admin
    When I open the "Parts catalog" tab
    And I add the part "Ceramic brake pads, front" number "BP-123" from "NAPA" costing "28.50" selling at "59.99"
    And I search the catalog for "ceramic"
    Then the catalog suggests "Ceramic brake pads, front"

  Scenario: Import a supplier price list
    Choose a CSV from your supplier or paste its text. One bad row stops the whole import and names the
    row to fix.
    Given I am in the shop admin
    When I open the "Parts catalog" tab
    And I import this parts list in admin:
      """
      Part Number,Name,Supplier,Cost,Price
      OF-77,Oil filter,NAPA,3.10,8.99
      WB-12,Wiper blade,NAPA,4.00,9.00
      """
    Then I am told "Imported 2 part(s)"

  Scenario: Review the questions the front desk asks
    The intake questions come from the shop's knowledge graph. Open **Intake form** to read them, and copy
    the file to your shop data folder if you want to change them.
    Given I am in the shop admin
    When I open the "Intake form" tab
    Then the intake form offers the problem "Brakes"
    When I open the intake category "Brakes"
    Then the admin shows "What does the brake problem feel or sound like?"

  Scenario: See whether your records are backed up
    Open **Backup** to see whether your shop's history is saved to a private GitHub repository.
    Connecting needs the GitHub command line signed in on this computer.
    Given I am in the shop admin
    When I open the "Backup" tab
    Then the admin shows "Not backed up yet"
    When I try to connect the backup to "not a repository"
    Then I am told "Use a GitHub owner/repository name" in the admin
