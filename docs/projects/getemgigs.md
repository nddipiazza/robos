---
title: "Get 'Em Gigs"
layout: default
parent: Projects
has_children: true
permalink: /projects/getemgigs/
nav_order: 2
redirect_from:
  - /projects/getemgigs/venue-stay-to-play-economics.html
---

# Get 'Em Gigs
{: .no_toc }

A Next.js web app for local bands, kept in the RobOS repository at `packages/getemgigs`. The App Wizard's web template was distilled from it.
{: .fs-6 }

## What it does

Get 'Em Gigs has two features. Both are implemented in `packages/getemgigs/src/lib/services.js`.

### Buddy Gigs

Two bands trade attendance: each agrees to go to the other's show, and both lock a deposit so the promise has a cost.

1. A band lists a gig with a venue, a start time and a deposit between $10 and $100 (the form default is $25).
2. Another band offers a trade between one of its gigs and that gig. The deposit for the deal is the larger of the two gigs' deposits.
3. When the invited band accepts, the deposit is held from both bands' balances in an internal ledger.
4. At the show, the visiting band opens the deal and displays a QR code. The band that is playing scans it. The deposit goes back to the visitor.
5. A daily job settles deals whose check-in windows have closed. A band that never showed up forfeits its deposit to the band it stood up.

The check-in window opens one hour before the show starts and closes five hours after. The state machine, the code format and the settlement rules are on [Buddy Gig scan-in and escrow]({{ '/projects/getemgigs/buddy-gig-geolocation-escrow.html' | relative_url }}).

### Stay-To-Play

A band can commit 2 to 10 tickets from one of its own gigs to another band's gig at the same venue. The venue must be marked as a Stay-To-Play partner; the six venues seeded into the database all are. The commitment is stored in the `stay_commitments` table and shown on the target gig's page. No money moves. The app records the commitment and nothing more.

{: .note }
Deposits are "gig credits" in an internal ledger. Every new band receives $100 in credits, and no card payments are processed. This is stated in the app's own README and FAQ.

## Run it locally

You need Node.js 20 or later. No database setup is required: without `DATABASE_URL` the app uses PGlite, a Postgres build that runs in-process.

```bash
cd packages/getemgigs
npm install
npm run dev     # Next.js dev server on http://localhost:3000
npm test        # node --test tests/unit/*.test.js
```

`.env.example` lists the other settings: `DATABASE_URL` for Neon Postgres, `CRON_SECRET` for the settlement job, `E2E_BYPASS_KEY` for the end-to-end tests, and the reCAPTCHA keys. Hosting, the database and the abuse controls are described on [Get 'Em Gigs architecture]({{ '/projects/getemgigs/vercel-serverless-architecture.html' | relative_url }}).

## Tests and evidence videos

The unit tests are 15 tests in `tests/unit` (check-in codes, security helpers, and the full deal lifecycle against PGlite). The end-to-end tests are 5 Cucumber scenarios in `tests/e2e/features`, driven by Playwright with one phone-sized browser per band.

```bash
cd packages/getemgigs
npx playwright install chromium
export E2E_BYPASS_KEY=$(openssl rand -hex 16)   # 32 characters; the key must be at least 24
export CRON_SECRET=$(openssl rand -hex 16)
npm run dev      # terminal 1: the server must see the same two variables
npm run e2e      # terminal 2: export the same two values first
npm run evidence # needs ffmpeg; writes evidence/*.mp4 and a combined reel
```

The tests run against `http://localhost:3000` unless you set `BASE_URL`. The escrow scenario calls the settlement endpoint with `CRON_SECRET`, and every browser session sends `E2E_BYPASS_KEY` so that rate limits do not interfere.

Recordings from an evidence run are included in this site's assets. Each one shows the band phones on a shared timeline with the Cucumber steps alongside.

<video controls preload="metadata" width="100%" poster="{{ '/assets/videos/getemgigs/02-buddy-gig-escrow.jpg' | relative_url }}">
  <source src="{{ '/assets/videos/getemgigs/getemgigs-e2e-evidence-reel.mp4' | relative_url }}" type="video/mp4">
</video>

*The full reel, about three minutes, with all five scenarios.*

| Scenario | Video |
|:---|:---|
| A new band signs up, creates a profile and logs back in | [01-signup-onboarding.mp4]({{ '/assets/videos/getemgigs/01-signup-onboarding.mp4' | relative_url }}) |
| Buddy Gig: deposits locked, host scans one band in, the no-show pays the host | [02-buddy-gig-escrow.mp4]({{ '/assets/videos/getemgigs/02-buddy-gig-escrow.mp4' | relative_url }}) |
| Stay-To-Play commitment at the same venue | [03-stay-to-play.mp4]({{ '/assets/videos/getemgigs/03-stay-to-play.mp4' | relative_url }}) |
| Weak passwords and disposable emails rejected at signup | [04a-signup-validation.mp4]({{ '/assets/videos/getemgigs/04a-signup-validation.mp4' | relative_url }}) |
| Honeypot, cross-site POST and password-guessing limits | [04b-api-abuse-controls.mp4]({{ '/assets/videos/getemgigs/04b-api-abuse-controls.mp4' | relative_url }}) |

## How it relates to RobOS

The package carries a `catalog-info.yaml` and a node in the RobOS knowledge graph (`urn:robos:frontend-app:getemgigs` in `.robos/kgraphs/applications/package.jsonld`). `DEPLOYMENT.md` in the package says the RobOS monorepo is the source of truth and the code is synced to a separate GitHub repository, `nddipiazza/thegigbandit`, which Vercel deploys. The App Wizard's `nextjs-vercel-web` template was distilled from this app; see [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}).

Source: [packages/getemgigs](https://github.com/nddipiazza/robos/tree/main/packages/getemgigs). The README lists the production site as https://www.getemgigs.com.
