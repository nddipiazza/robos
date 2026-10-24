---
title: "Buddy Gig scan-in and escrow"
layout: default
parent: "Get 'Em Gigs"
grand_parent: Projects
nav_order: 1
description: "How Get 'Em Gigs holds deposits for a Buddy Gig, confirms attendance with a QR scan at the door, and settles no-shows the next morning. Read this if you want to change or reuse the deal logic."
---

# Buddy Gig scan-in and escrow
{: .no_toc }

How Get 'Em Gigs holds deposits for a Buddy Gig, confirms attendance with a QR scan at the door, and settles no-shows the next morning. Read this if you want to change or reuse the deal logic.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

{: .note }
The file name says "geolocation" because an earlier version verified attendance by GPS. The current code does not. `src/lib/schema.js` marks the camera check-in as replacing GPS, venue coordinates are stored as null for user-added venues, and the response headers in `next.config.mjs` set `Permissions-Policy` to block geolocation. The unused `distance_m` column is still in the `attendance` table.

## Deal states

The logic is in `packages/getemgigs/src/lib/services.js`. A deal is an `agreements` row. Each deal has two `attendance` rows, one per band, created when the deal is accepted. Each row records which band is attending and which band is hosting.

| From | Event | To | Ledger effect |
|:---|:---|:---|:---|
| none | A band offers a trade (`POST /api/agreements`) | `PROPOSED` | None. The proposer must hold enough credits for the deposit. |
| `PROPOSED` | The invited band declines, or the proposer cancels | `DECLINED` or `CANCELLED` | None. |
| `PROPOSED` | The invited band accepts | `ACTIVE` | `DEPOSIT_HOLD` of minus the deposit for both bands. Two attendance rows are created, each with a random code secret. |
| `ACTIVE` | The host band scans an attendee's code | attendance `VERIFIED` | `DEPOSIT_REFUND` of plus the deposit to the attendee. Attendee reputation goes up by 1, capped at 100. |
| `ACTIVE` | Both attendances are verified | `SETTLED` | None. |
| `ACTIVE` | Settlement runs after both check-in windows have closed | `SETTLED` | See the next section. |

The deposit is the larger of the two gigs' deposits. Accepting runs `UPDATE agreements SET status='ACTIVE' ... WHERE status='PROPOSED'` and proceeds only if that update changed a row, so a double tap or a race locks the deposits once.

At settlement, each attendance still `PENDING` is resolved one of two ways:

| Condition | Attendance | Ledger effect |
|:---|:---|:---|
| The attendee never opened their code in the window | `FORFEITED` | `FORFEIT_PAYOUT` of plus the deposit to the host band. Attendee reputation goes down by 10, floored at 0. |
| The attendee opened their code but the host never scanned it | `DISPUTED` | `DEPOSIT_REFUND` to the attendee. The host gets nothing. |

## Check-in codes

`src/lib/checkin.js` builds the code from 30 bytes, encoded as base64url:

```text
attendanceId (16 bytes) | time step (4 bytes) | first 10 bytes of HMAC-SHA256(secret, attendanceId | time step)
```

The time step is the current Unix time divided by 30 seconds, so the code changes every 30 seconds. The secret is a random value stored with the attendance row and never sent to a client. `verifyCode` compares the MAC in constant time, then accepts steps from 3 steps in the past to 1 step in the future, which is about 90 seconds. An older step returns `expired`. Anything else returns `invalid`.

The check-in window opens 1 hour before the gig starts and closes 5 hours after.

## The scan

1. The attendee opens the deal during the window. `GET /api/agreements/:id/code` returns the current code and a QR image of `https://<site>/scan/<code>`. The first request inside the window sets `checkin_requested_at` on the attendance row. The page reloads the code when the current one rotates.
2. The host band scans the QR. The in-app scanner (**Scan check-in code** on the deal page) uses the browser's `BarcodeDetector` when it exists and falls back to jsQR. A host can also point a phone's camera app at the code. The QR is a link to `/scan/<code>`, which scans on behalf of the logged-in user.
3. `POST /api/checkin/scan` rejects the code unless it parses, the MAC matches, it has not expired, the scanner is the host band for that attendance, the deal is `ACTIVE`, and the gig's window is open. On success it marks the attendance `VERIFIED` and refunds the deposit.

Only the host can scan, and an attendee who opened their code is never forfeited. Together these mean a host cannot take a deposit by declining to scan. Rotating codes make it hard to scan a screenshot sent to someone who is not at the venue.

## Settlement

`vercel.json` calls `GET /api/cron/settle` daily at `0 11 * * *` (11:00 UTC). The route requires `Authorization: Bearer $CRON_SECRET`. It settles every `ACTIVE` deal whose two check-in windows are both over, using the rules above.

An operator can also `POST` `{ "agreementId": "<uuid>", "asOf": "<ISO time>" }` with the same bearer secret to settle one deal as of a chosen time. The end-to-end test uses this to simulate the next morning.

## Tests

| Test | Covers |
|:---|:---|
| `tests/unit/checkin.test.js` | Round trip through a scanned URL, rotation and expiry, tampered codes, the check-in window. |
| `tests/unit/services.test.js` | Propose, accept, only-host-can-scan, garbage and expired codes, double scan, early settlement doing nothing, forfeit payout with reputation change, and the disputed refund. |
| `tests/e2e/features/02_buddy_gig_escrow.feature` | The same flow through the UI with two phone sessions. The test gives the host's browser a fake camera showing the attendee's live QR code. |

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/02-buddy-gig-escrow.jpg' | relative_url }}">
  <source src="{{ '/assets/videos/getemgigs/02-buddy-gig-escrow.mp4' | relative_url }}" type="video/mp4">
</video>

*Recording of the escrow scenario. Watch the deposit lock (Marco's wallet goes from $100 to $75), the refund after the scan, and the $25 no-show payout that takes Jess to $125.*
