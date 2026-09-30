@e2e @auth @mobile
Feature: Visitor signs up, logs out and logs back in
  New users can create an account from their phone, reach their dashboard,
  and sign back in later.

  Scenario: A visitor signs up from the landing page and logs back in
    Given "Jess" opens the site on a phone
    When "Jess" taps the call to action in the hero
    And "Jess" signs up with a fresh email and a strong password
    Then "Jess" sees her dashboard
    When "Jess" logs out
    And "Jess" logs back in with the same credentials
    Then "Jess" sees her dashboard
