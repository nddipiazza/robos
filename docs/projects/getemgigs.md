---
title: The Gig Bandit & Get 'Em Gigs
layout: default
parent: RobOS Projects
has_children: true
permalink: /projects/getemgigs/
nav_order: 2
---

# The Gig Bandit & Get 'Em Gigs (`getemgigs.com`)
{: .no_toc }

A live, production web app for local bands: trade attendance with **Buddy Gigs** backed by deposits and GPS check-in, and replace pay-to-play with **Venue Stay-To-Play**. Built, deployed and verified end-to-end with RobOS video proof-of-work.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; margin: 1.5rem 0;">
  <h3 style="margin-top: 0; color: #58a6ff;">🚀 Live in production</h3>
  <p style="color: #c9d1d9; font-size: 0.95rem; margin-bottom: 0;">
    <strong>App:</strong> <a href="https://www.getemgigs.com" target="_blank" rel="noopener noreferrer">https://www.getemgigs.com</a> — open signup, phone-first<br/>
    <strong>Source:</strong> <code>packages/getemgigs</code> in RobOS, synced to <a href="https://github.com/nddipiazza/thegigbandit" target="_blank" rel="noopener noreferrer">github.com/nddipiazza/thegigbandit</a> (Vercel deploys from <code>main</code>)<br/>
    <strong>Health:</strong> <a href="https://www.getemgigs.com/api/health" target="_blank" rel="noopener noreferrer">/api/health</a> → Neon Postgres<br/>
    <strong>Knowledge Graph node:</strong> <code>urn:robos:app:getemgigs</code> (<code>schema:WebApplication</code>, <code>robos:FrontEndApp</code>)
  </p>
</div>

## The problem

Local bands struggle to fill rooms. Friends and fellow bands promise to come, then bail. And predatory **pay-to-play** venues make bands pre-buy tickets to their own show and eat the loss.

## How Get ’Em Gigs fixes it

### 1. Buddy Gigs — “I’ll come to your gig if you come to mine”

1. Each band lists a gig (venue, time, deposit between $10 and $100).
2. Band A finds Band B’s show and offers a trade. When B accepts, **both deposits are locked**.
3. At the show, the attendee taps **Check in**. The phone’s GPS fix must be **within 150 m** of the venue during the window (doors = 1 h before start, until 5 h after). The deposit comes straight back.
4. A **daily settlement cron** (06:00 CT) closes every deal whose windows are over. Anyone who never checked in **forfeits their deposit to the band they stood up**, and their reputation score drops.

Either you get a crowd, or you get paid.

### 2. Venue Stay-To-Play

Instead of buying tickets to your own gig, you commit 2–10 tickets to **another band’s show at the same partner venue**. The venue still gets a crowd, and bands build the scene they play in.

> **Beta economics:** every band starts with $100 in *gig credits*. Deposits, refunds and payouts are recorded in a ledger; no real card payments are processed yet.

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/buddy-gig-escrow-flow.jpg' | relative_url }}" alt="Buddy Gig reciprocal agreement lifecycle" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
</div>

---

## Video proof-of-work: live E2E against getemgigs.com

Every scenario below is a **Cucumber BDD test that ran against the production site**. Each band is a separate phone-sized browser session that really signs up, logs in and uses the app. RobOS records each phone with wall-clock-stamped CDP screencast frames, then stitches all phones onto **one shared timeline of events** with a Cucumber scenario splash card, a step HUD, the step list and a moving playhead. Test accounts delete themselves afterwards.

### Full evidence reel (all scenarios, ~3.5 min)

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/02-buddy-gig-escrow.jpg' | relative_url }}" style="border-radius: 8px; border: 1px solid #30363d; margin: 16px 0;">
  <source src="{{ '/assets/videos/getemgigs/getemgigs-e2e-evidence-reel.mp4' | relative_url }}" type="video/mp4">
</video>

### Scenario 1 — A new band signs up, creates its profile and logs back in

`@e2e @auth @mobile` · 9 steps · passed

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/01-signup-onboarding.jpg' | relative_url }}" style="border-radius: 8px; border: 1px solid #30363d; margin: 16px 0;">
  <source src="{{ '/assets/videos/getemgigs/01-signup-onboarding.mp4' | relative_url }}" type="video/mp4">
</video>

### Scenario 2 — Buddy Gig: deposits locked, GPS check-in refunds one band, the no-show pays the host

`@e2e @buddy-gig @escrow @geolocation` · two phones (Jess / Neon Vipers and Marco / Velvet Riot) · 15 steps · passed

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/02-buddy-gig-escrow.jpg' | relative_url }}" style="border-radius: 8px; border: 1px solid #30363d; margin: 16px 0;">
  <source src="{{ '/assets/videos/getemgigs/02-buddy-gig-escrow.mp4' | relative_url }}" type="video/mp4">
</video>

Timeline: Marco lists a gig at The Mohawk starting in 20 minutes → Jess lists hers for 3 days out → Jess offers a Buddy Gig → Marco accepts (both wallets $100 → $75) → Jess “arrives” at The Mohawk (GPS ~25 m from the door) and checks in → her $25 comes back → settlement runs for the morning after Jess’s show → Marco never showed, so his $25 is paid to Jess ($125).

### Scenario 3 — Stay-To-Play at a partner venue

`@e2e @stay-to-play` · two phones · 6 steps · passed

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/03-stay-to-play.jpg' | relative_url }}" style="border-radius: 8px; border: 1px solid #30363d; margin: 16px 0;">
  <source src="{{ '/assets/videos/getemgigs/03-stay-to-play.mp4' | relative_url }}" type="video/mp4">
</video>

### Scenario 4 — Abuse controls on open signup

`@e2e @security @abuse` · weak password and disposable email rejected in the UI; honeypot → **400**, cross-site POST → **403**, 11th wrong-password login → **429**, all against production.

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/04a-signup-validation.jpg' | relative_url }}" style="border-radius: 8px; border: 1px solid #30363d; margin: 16px 0;">
  <source src="{{ '/assets/videos/getemgigs/04a-signup-validation.mp4' | relative_url }}" type="video/mp4">
</video>

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/04b-api-abuse-controls.jpg' | relative_url }}" style="border-radius: 8px; border: 1px solid #30363d; margin: 16px 0;">
  <source src="{{ '/assets/videos/getemgigs/04b-api-abuse-controls.mp4' | relative_url }}" type="video/mp4">
</video>

### Re-running the evidence

```bash
cd packages/getemgigs
BASE_URL=https://www.getemgigs.com E2E_BYPASS_KEY=... CRON_SECRET=... npm run e2e   # Cucumber + Playwright
node scripts/encode-frames.mjs    # CDP frames → wall-clock-exact MP4 per phone
npm run evidence                  # splash + HUD + multi-phone timeline → evidence/*.mp4 + reel
scripts/make-hero-gif.sh evidence/02-*/jess.mp4 public/hero.gif "8-15 36-52 58-66 69-74"
```

---

## Architecture

| **Layer** | **Implementation** |
|:---|:---|
| **Framework** | Next.js 15 App Router (server components + JSON route handlers), React 19, plain CSS (mobile-first, bottom tab bar) |
| **Database** | Neon serverless Postgres via Vercel Marketplace (`DATABASE_URL`); embedded **PGlite** (real Postgres in WASM) for local dev and unit tests. Idempotent schema on cold start |
| **Auth** | Email + password, bcrypt (cost 11), random 256-bit session tokens stored only as SHA-256 hashes, HttpOnly + SameSite=Lax + Secure cookies, 30-day expiry |
| **Domain** | Bands, venues (6 seeded + user-added with “use my location”), gigs, agreements, attendance, ledger, Stay-To-Play commitments |
| **Geofence** | Haversine distance ≤ 150 m, GPS accuracy ≤ 100 m, time window check. Only the distance is stored, never coordinates |
| **Settlement** | Vercel Cron `0 11 * * *` → `/api/cron/settle` (Bearer `CRON_SECRET`) |
| **Hosting** | Vercel (project `thegigbandit`), domains `getemgigs.com` / `www.getemgigs.com` |
| **Tests** | 16 unit/domain tests (Node test runner + PGlite) · 5 Cucumber scenarios / 47 steps against production |

## Abuse controls

Signup is open. **reCAPTCHA v3 is wired in but disabled** (`RECAPTCHA_ENABLED` / `NEXT_PUBLIC_RECAPTCHA_ENABLED` plus keys turn it on; Google’s script only loads when enabled).

- **Rate limits** (Postgres-backed so they hold across serverless instances): signup 5/hour and 20/day per IP, 60/min globally; login 10 per 15 min per email and 30 per IP; per-user caps on gigs (10/day), venues (5/day), Buddy Gig offers (20/day) and check-ins
- **Bot traps:** hidden honeypot field and a minimum form-fill time
- **Input hygiene:** disposable-email blocklist, password length/common-password/email-name checks, control-character stripping, length limits, 20 KB body cap, UUID validation
- **CSRF:** same-origin check on every mutation plus SameSite cookies
- **Headers:** strict CSP, HSTS, `X-Frame-Options: DENY`, `Permissions-Policy` limiting geolocation to the site
- **Audit log** of sign-ups, logins, failed logins, check-ins and account deletions
- **Account deletion** from the Account page cascades all of a band’s data

## In-depth documentation

1. [**Buddy Gig Geolocation & Escrow Engine**]({{ '/projects/getemgigs/buddy-gig-geolocation-escrow.html' | relative_url }}) — state machine, geofence, settlement
2. [**Venue Stay-To-Play Economics**]({{ '/projects/getemgigs/venue-stay-to-play-economics.html' | relative_url }}) — why reciprocal ticket commitments beat pay-to-play
3. [**Vercel & Neon Architecture**]({{ '/projects/getemgigs/vercel-serverless-architecture.html' | relative_url }}) — deployment, database, cron, environment
