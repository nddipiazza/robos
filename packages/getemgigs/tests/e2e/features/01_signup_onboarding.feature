@e2e @auth @mobile
Feature: Band signs up and onboards on getemgigs.com
  Local bands can create an account from their phone, set up a band profile,
  receive beta gig credits, and log back in.

  Scenario: A new band signs up from the landing page, creates its profile and logs back in
    Given "Jess" opens getemgigs.com on a phone
    When "Jess" taps the sign up button in the hero
    And "Jess" signs up with a fresh email and a strong password
    Then "Jess" is asked to set up a band
    When "Jess" creates the band "Neon Vipers" from "Austin, TX"
    Then "Jess" sees the dashboard for "Neon Vipers" with a wallet of "$100"
    When "Jess" logs out
    And "Jess" logs back in with the same credentials
    Then "Jess" sees the dashboard for "Neon Vipers" with a wallet of "$100"
