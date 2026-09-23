@e2e @stay-to-play @mobile
Feature: Venue Stay-To-Play instead of pay-to-play
  Bands commit to buying tickets for another band at the same partner venue
  instead of buying tickets to their own show.

  Scenario: A band commits Stay-To-Play tickets to another band's show at the same venue
    Given "Priya" is signed up with the band "Midnight Echoes"
    And "Dev" is signed up with the band "Rusty Anchor"
    When "Priya" lists the gig "Echoes Dream Pop Night" at "Empty Bottle" starting in 6 days with a "$20" deposit
    And "Dev" lists the gig "Anchor Americana Hoedown" at "Empty Bottle" starting in 9 days with a "$20" deposit
    And "Dev" opens "Echoes Dream Pop Night" and commits 4 Stay-To-Play tickets
    Then "Priya" sees "Rusty Anchor (4)" supporting "Echoes Dream Pop Night"
