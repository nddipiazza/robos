---
title: "Get ’Em Gigs"
package: getemgigs
category: "libraries"
component_type: component
permalink: /getemgigs/
redirect_from:
  - /apps/getemgigs/
summary: "Next.js 15 + Neon/PGlite web application (`getemgigs.com`) for local band Buddy Gig deposit escrow, rotating QR door scan-in, and Stay-To-Play ticket commitments."
description: "Get 'Em Gigs (packages/getemgigs): Next.js 15 & React 19 web app where local bands trade show attendance with escrow deposits, rotating HMAC QR door scans, daily cron settlement, and multi-phone Playwright evidence."
related:
  - /projects/getemgigs/
  - /urban-plant-tracker/
  - /new-app-wizard/
---

`packages/getemgigs` (**Get ’Em Gigs — The Gig Bandit**) is a mobile-first Next.js 15 (App Router) and React 19 web application built and verified in RobOS. Local bands trade show attendance (*"I'll come to your gig if you come to mine"*) backed by escrowed gig-credit deposits and rotating QR check-ins at the venue door, alongside **Venue Stay-To-Play** ticket commitments.

## Architecture & deal flow

- **Buddy Gig escrow & QR verification**: Accepting a trade holds deposits from both bands in the Postgres ledger (`src/lib/services.js`). At the show, the attending band displays a rotating HMAC-signed QR code (~90s window) scanned in-app (`BarcodeDetector` / `jsqr`) by the host band to release the deposit and increment reputation.
- **Automated settlement & abuse controls**: A daily cron handler (`/api/cron/settle`) settles unverified no-shows while returning deposits if a code was opened at the show without being scanned. Includes bcrypt + opaque SHA-256 session cookies, Postgres rate limits, CSRF checks, and CSP/HSTS headers.
- **Embedded PGlite & multi-phone E2E**: Runs locally and in `npm test` against embedded PGlite (Neon Postgres in production) and records wall-clock-aligned multi-phone Cucumber + Playwright proof videos (`npm run evidence`).

Read the deep-dive guides at [Get ’Em Gigs project overview](/projects/getemgigs/), [Buddy Gig scan-in and escrow](/projects/getemgigs/buddy-gig-geolocation-escrow/), and [Get ’Em Gigs architecture](/projects/getemgigs/vercel-serverless-architecture/).

```bash
cd packages/getemgigs
npm install
npm test
npm run dev
```

Source: [`packages/getemgigs`](https://github.com/nddipiazza/robos/tree/main/packages/getemgigs).
