# Get ’Em Gigs — The Gig Bandit (`getemgigs.com`)

[![CI](https://github.com/nddipiazza/thegigbandit/actions/workflows/ci.yml/badge.svg)](https://github.com/nddipiazza/thegigbandit/actions/workflows/ci.yml)
[![RobOS Project](https://img.shields.io/badge/RobOS-Project-00bcd4)](https://rowbose.com/projects/getemgigs/)

Local bands trade attendance: **“I’ll come to your gig if you come to mine.”** Both bands lock a small deposit.
Check in at the venue (GPS, within 150 m) and you get it back. Bail, and the next-morning settlement pays your
deposit to the band you stood up. Plus **Venue Stay-To-Play**: commit tickets to another band at the same venue
instead of paying to play your own show.

Live: **https://www.getemgigs.com**

## Features

- Email + password accounts (bcrypt, opaque server-side sessions, HttpOnly/SameSite cookies)
- Band profiles, venues (6 seeded + user-added with “use my location”), gigs
- Buddy Gig offers → accept → deposit escrow ledger → GPS check-in → refund
- Daily settlement cron (`/api/cron/settle`, 06:00 CT) forfeits no-show deposits to the host band
- Stay-To-Play ticket commitments at partner venues
- Mobile-first UI with bottom tab bar, works as a home-screen web app
- Beta economics: every band starts with $100 in **gig credits** (no real card payments yet)

## Abuse controls (signup is open)

- Postgres-backed rate limits: signup 5/h & 20/day per IP, login 10/15 min per email & 30/15 min per IP,
  per-user limits on gigs, venues, offers, check-ins
- Honeypot field + minimum form-fill time, disposable-email blocklist, password strength rules
- Same-origin check on every mutation (CSRF), strict CSP & security headers, request size limits
- Audit log of sign-ups, logins, failed logins and check-ins
- **reCAPTCHA v3 is wired in but disabled** — set `RECAPTCHA_ENABLED=true`, `RECAPTCHA_SECRET_KEY`,
  `NEXT_PUBLIC_RECAPTCHA_ENABLED=true`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` to turn it on

## Stack

Next.js 15 (App Router) · React 19 · Neon serverless Postgres (Vercel Marketplace) · embedded PGlite for
local dev/tests · Vercel Cron · Cucumber + Playwright E2E with RobOS video evidence.

## Develop

```bash
npm install
npm run dev          # no DATABASE_URL needed — uses embedded PGlite
npm test             # unit + domain tests against real Postgres (PGlite)
```

## E2E + RobOS evidence videos

```bash
# against local
E2E_BYPASS_KEY=... CRON_SECRET=... npm run e2e
# against production
BASE_URL=https://www.getemgigs.com E2E_BYPASS_KEY=... CRON_SECRET=... npm run e2e
npm run evidence     # splash intro + step HUD + multi-phone timeline → evidence/*.mp4 + reel
```

Every actor (band) gets its own recorded phone session; `scripts/build-evidence.mjs` aligns them on one wall
clock with a Cucumber splash card, step HUD, step list and moving playhead. Test accounts delete themselves.

## Environment

See `.env.example`. Production needs `DATABASE_URL` (Neon), `CRON_SECRET`, optionally `E2E_BYPASS_KEY`.
