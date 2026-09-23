---
title: Buddy Gig Scan-In & Escrow Engine
layout: default
parent: The Gig Bandit & Get 'Em Gigs
grand_parent: RobOS Projects
nav_order: 1
---

# Buddy Gig Scan-In & Escrow Engine
{: .no_toc }

How getemgigs.com locks deposits, verifies attendance with a Venmo-style QR scan at the door, and settles no-shows the next morning.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Agreement state machine

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/escrow-state-machine.jpg' | relative_url }}" alt="Buddy Gig escrow lifecycle" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
</div>

| From | Event | To | Ledger effect |
|:---|:---|:---|:---|
| — | Band A offers a trade (`POST /api/agreements`) | `PROPOSED` | none (A must hold enough credits) |
| `PROPOSED` | B accepts | `ACTIVE` | `DEPOSIT_HOLD` −deposit for **both** bands; two `attendance` rows created, each with a random code secret |
| `PROPOSED` | B declines / A withdraws | `DECLINED` / `CANCELLED` | none |
| `ACTIVE` | host band scans the attendee’s code | attendance `VERIFIED` | `DEPOSIT_REFUND` +deposit to attendee, reputation +1 |
| `ACTIVE` | both attendees verified | `SETTLED` | — |
| `ACTIVE` | settlement after both windows close | `SETTLED` | attendee who never opened their code → `FORFEITED`, `FORFEIT_PAYOUT` +deposit to the **host** band, reputation −10. Attendee who opened their code but was never scanned → `DISPUTED`, deposit returned, no payout |

The deposit is the higher of the two gigs’ deposits. Accepting uses a conditional `UPDATE … WHERE status='PROPOSED'` as the lock, so a double-tap or race can only lock deposits once.

## 2. Camera scan-in (Venmo-style)

`src/lib/checkin.js`:

```javascript
// code = base64url( attendanceId[16] | timeStep[4] | HMAC-SHA256(secret, attendanceId|timeStep)[0..10] )
export function makeCode(attendanceId, secret, now = Date.now()) { /* 30 s time step */ }
export function verifyCode(parsed, secret, now = Date.now()) {
  // constant-time MAC check, then: accept steps from now-3 to now+1 (≈90 s), else 'expired'
}
```

1. **Attendee** opens the deal at the show. `GET /api/agreements/:id/code` returns the current code and a QR (SVG) for `https://www.getemgigs.com/scan/<code>`. The screen refreshes it every 30 s. The first time it is opened inside the check-in window, `checkin_requested_at` is recorded.
2. **Host band** taps **Scan check-in code**. The in-app scanner uses `getUserMedia` plus the native `BarcodeDetector` (Android Chrome) or jsQR (iOS Safari, desktop). The host can also just point their camera app at the code, which opens `/scan/<code>` logged in as them.
3. `POST /api/checkin/scan` checks that the code parses, the MAC matches, the code is fresh, the scanner is **the host band for that attendance**, the deal is active, and the gig window is open. Then the attendee’s deposit is refunded and their screen flips to “scanned in” within a few seconds.

**Why this design.** The person who would benefit from a no-show (the host) is the one who confirms attendance, so a scan is strong evidence. To stop a host from pocketing a deposit by refusing to scan, an attendee who opened their code during the window is never forfeited. At worst they get their deposit back. Codes can’t be forged without the per-attendance secret (never sent to clients), and rotating codes make remote screenshot sharing impractical.

## 3. Next-morning settlement

`vercel.json` schedules `GET /api/cron/settle` at `0 11 * * *` (06:00 CT). Vercel sends `Authorization: Bearer $CRON_SECRET`. The job finds `ACTIVE` agreements whose two check-in windows have both closed, forfeits every `PENDING` attendance whose code was never opened to its host band, returns the deposit (no payout) when the code was opened but never scanned, and marks the agreement `SETTLED`. Operators can `POST {agreementId, asOf}` with the same secret to settle a single deal at a given time; the live E2E suite uses this to demonstrate the “morning after”.

## 4. Verified by

- `tests/unit/checkin.test.js` — code round-trip through a scanned URL, rotation and ~90 s expiry, tampering, check-in window
- `tests/unit/services.test.js` — full lifecycle against real Postgres (PGlite): propose, accept, only-host-can-scan, expired code, garbage code, double scan, early settlement no-op, forfeiture payout, dispute refund
- Live E2E scenario 2 on the [project page]({{ '/projects/getemgigs/' | relative_url }}) — two phones against the production database; the host phone’s camera is fed the attendee’s live QR code
