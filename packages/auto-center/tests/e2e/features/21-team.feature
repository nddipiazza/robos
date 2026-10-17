Feature: Build your shop team
  Before a car comes in, set up the people who will work on it. Teammates can be linked to a person in
  RobOS People so the shop uses the same identities as the rest of RobOS, and each teammate's hours are
  tracked per repair.

  Scenario: Add a technician linked to a RobOS person
    Open **Repair lifecycle**, expand **Add a teammate**, enter a name and role, and pick the matching
    person from RobOS People. The link keeps the shop roster in step with your RobOS directory. Hourly
    labor cost is optional and feeds the profit reports.
    When I add the teammate "Maria Lopez" as "Master technician" linked to the RobOS person "Maria Lopez"
    Then the team roster lists "Maria Lopez · Master technician · RobOS: Maria Lopez"

  Scenario: Add a teammate who is not in RobOS yet
    Not everyone has a RobOS account. Leave the person set to "Not linked" and the teammate still works
    on repairs; you can link them later.
    When I add the teammate "Chris Park" as "Apprentice"
    Then the team roster lists "Chris Park · Apprentice"

  Scenario: The same teammate cannot be added twice
    The roster refuses a second teammate with the same name or the same RobOS person, so hours are never
    split across duplicate records.
    Given the shop team has "Maria Lopez" as "Master technician" linked to the RobOS person "Maria Lopez"
    When I add the teammate "Maria Lopez" as "Technician"
    Then I am told "This teammate already exists"
    And the team roster does not list "Maria Lopez" twice

  Scenario: A malformed hourly cost is rejected
    Labor cost must be an amount such as 30.00. Anything else is refused with a plain message.
    When I add the teammate "Dan Okafor" as "Technician" with an hourly cost of "thirty"
    Then I am told "Enter an amount with up to two decimals"
