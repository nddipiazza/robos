---
title: Buddy Gig Geolocation & Escrow Engine
layout: default
parent: The Gig Bandit & Get 'Em Gigs
grand_parent: RobOS Projects
nav_order: 1
---

# Buddy Gig Geolocation & Escrow Engine
{: .no_toc }

How getemgigs.com locks deposits, verifies attendance with GPS, and settles no-shows the next morning.
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
| `PROPOSED` | B accepts | `ACTIVE` | `DEPOSIT_HOLD` −deposit for **both** bands; two `attendance` rows created |
| `PROPOSED` | B declines / A withdraws | `DECLINED` / `CANCELLED` | none |
| `ACTIVE` | attendee checks in within 150 m | attendance `VERIFIED` | `DEPOSIT_REFUND` +deposit to attendee, reputation +1 |
| `ACTIVE` | both attendees verified | `SETTLED` | — |
| `ACTIVE` | settlement after both windows close | `SETTLED` | each `PENDING` attendee → `FORFEITED`, `FORFEIT_PAYOUT` +deposit to the **host** band, bailer reputation −10 |

The deposit is the higher of the two gigs’ deposits. Accepting uses a conditional `UPDATE … WHERE status='PROPOSED'` as the lock, so a double-tap or race can only lock deposits once.

## 2. Geofence

`src/lib/geo.js`:

```javascript
export function verifyCheckIn({ lat, lon, accuracy, venueLat, venueLon, startsAt, now = new Date() }) {
  if (!isValidCoord(lat, lon)) return { ok: false, reason: 'Invalid GPS coordinates.' };
  const { opensAt, closesAt } = checkInWindow(startsAt);       // doors (−1h) … +5h
  if (now < opensAt || now > closesAt) return { ok: false, reason: 'Outside the check-in window.' };
  if (accuracy > MAX_GPS_ACCURACY_M) return { ok: false, reason: 'GPS accuracy too low.' };   // 100 m
  const d = distanceMeters(lat, lon, venueLat, venueLon);      // Haversine
  return d <= CHECKIN_RADIUS_M ? { ok: true, distanceM: d } : { ok: false, distanceM: d };   // 150 m
}
```

The browser sends one `navigator.geolocation` fix (high accuracy, no cached position) when the user taps **Check in**. Only the distance in meters is stored.

$$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right),\quad R = 6{,}371{,}000\text{ m}$$

**Honest limits.** Browser GPS can be spoofed by a determined user. The beta mitigates this with accuracy thresholds, per-user check-in rate limits, audit logging and reputation, and deposits are credits rather than cash. Stronger options later: venue QR codes rotated per night, or the host band confirming arrivals.

## 3. Next-morning settlement

`vercel.json` schedules `GET /api/cron/settle` at `0 11 * * *` (06:00 CT). Vercel sends `Authorization: Bearer $CRON_SECRET`. The job finds `ACTIVE` agreements whose two check-in windows have both closed, forfeits every `PENDING` attendance to its host band, and marks the agreement `SETTLED`. Operators can `POST {agreementId, asOf}` with the same secret to settle a single deal at a given time; the live E2E suite uses this to demonstrate the “morning after”.

## 4. Verified by

- `tests/unit/services.test.js` — full lifecycle against real Postgres (PGlite): propose, accept, far/near check-in, double check-in rejection, early settlement no-op, forfeiture payout and reputation
- Live E2E scenario 2 on the [project page]({{ '/projects/getemgigs/' | relative_url }}) — two phones, real production database
