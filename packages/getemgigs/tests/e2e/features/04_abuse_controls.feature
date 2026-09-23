@e2e @security @abuse
Feature: Basic abuse controls on open signup
  Signup is open (reCAPTCHA v3 is wired but disabled), so the API enforces
  validation, honeypots, same-origin checks and rate limits.

  Scenario: Weak passwords and disposable emails are rejected at signup
    Given "Mallory" opens the sign up page on a phone
    When "Mallory" tries to sign up with the password "password123"
    Then "Mallory" sees the error "too common"
    When "Mallory" tries to sign up with the email "bot@mailinator.com"
    Then "Mallory" sees the error "Disposable email addresses are not allowed"

  Scenario: The API blocks bots, cross-site posts and password guessing
    Then a signup that fills the hidden honeypot field is rejected
    And a cross-site POST to the signup API is blocked with 403
    And repeated wrong-password logins for one email are rate limited with 429
