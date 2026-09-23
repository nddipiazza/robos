---
title: Vercel & Neon Architecture
layout: default
parent: The Gig Bandit & Get 'Em Gigs
grand_parent: RobOS Projects
nav_order: 3
---

# Vercel & Neon Architecture
{: .no_toc }

How getemgigs.com is built, stored, scheduled and deployed.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Runtime

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/vercel-edge-architecture.jpg' | relative_url }}" alt="Get 'Em Gigs on Vercel" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
</div>

- **Next.js 15 App Router** on Vercel Node serverless functions. Pages are server components that read the session cookie and query Postgres directly; forms are small client components that call JSON route handlers under `/api/*`.
- **Route wrapper** (`src/lib/session.js#route`): same-origin enforcement on mutations, uniform JSON errors, and `Retry-After` on 429.
- **Security headers** from `next.config.mjs`: CSP (Google reCAPTCHA hosts are added only when captcha is enabled), HSTS, frame denial and a geolocation-only Permissions-Policy.

## 2. Data

| Environment | Driver | Configured by |
|:---|:---|:---|
| Production / Preview | `@neondatabase/serverless` (HTTP) | `DATABASE_URL`, injected by the Neon Vercel Marketplace integration (`getemgigs-db`) |
| Local dev / unit tests | `@electric-sql/pglite` (Postgres compiled to WASM) | nothing, in-memory or `PGLITE_DIR` |

`src/lib/schema.js` is a list of idempotent `CREATE … IF NOT EXISTS` statements run once per cold start, followed by seeding six real venues. The tables are `users`, `sessions`, `bands`, `venues`, `gigs`, `agreements`, `attendance`, `ledger`, `stay_commitments`, `rate_limits` and `audit_log`.

Rate limits use an `INSERT … ON CONFLICT DO UPDATE` fixed-window counter in `rate_limits`, so they hold across every serverless instance with no extra service.

## 3. Environment variables

| Key | Purpose |
|:---|:---|
| `DATABASE_URL` (+ Neon extras) | Neon Postgres |
| `CRON_SECRET` | Bearer secret for `/api/cron/settle` |
| `E2E_BYPASS_KEY` | Lets the E2E suite skip rate limits and honeypot via the `x-e2e-key` header |
| `RECAPTCHA_ENABLED`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`, `NEXT_PUBLIC_RECAPTCHA_ENABLED`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA v3 (off by default) |

## 4. Deploy pipeline

1. Source of truth: `packages/getemgigs` in the RobOS monorepo.
2. Synced to `github.com/nddipiazza/thegigbandit`; GitHub Actions runs `npm test` and `next build`.
3. Vercel project `thegigbandit` deploys `main` to production (`www.getemgigs.com`).
4. Verify with `GET /api/health` (`{"ok":true,"db":"neon"}`), then run the live Cucumber suite and rebuild the evidence videos.
