@e2e @buddy-gig @escrow @camera-checkin @mobile
Feature: Buddy Gig — mutual attendance with deposit escrow and scan-in at the door
  Two bands trade attendance. Both lock a deposit. Like Venmo, the attendee shows a
  rotating check-in QR and the band playing scans it with their phone camera; that
  releases the deposit. A no-show forfeits it to the host band.

  Scenario: Two bands make a Buddy Gig deal, the host scans one in at the door, the other bails and pays the host
    Given "Jess" is signed up with the band "Neon Vipers"
    And "Marco" is signed up with the band "Velvet Riot"
    When "Marco" lists the gig "Riot at the Mohawk" at "The Mohawk" starting in 20 minutes with a "$25" deposit
    And "Jess" lists the gig "Vipers Record Release" at "Cheer Up Charlies" starting in 3 days with a "$25" deposit
    And "Jess" finds "Riot at the Mohawk" in the gig list and offers a Buddy Gig
    Then "Marco" sees the Buddy Gig offer from "Neon Vipers" on the dashboard
    When "Marco" accepts the Buddy Gig offer
    Then the deal shows "Deposits locked" for "Marco"
    And "Marco" has a wallet of "$75"
    When "Jess" arrives at "The Mohawk" and shows her check-in code
    And "Marco" scans the check-in code on Jess's phone at the door
    Then "Jess" sees she was scanned in and the deposit refunded
    And "Jess" has a wallet of "$100"
    When the next-morning settlement runs for the deal after both gigs
    Then "Jess" sees a no-show payout of "$25" from "Velvet Riot"
    And "Jess" has a wallet of "$125"
