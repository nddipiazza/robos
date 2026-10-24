---
title: "Get 'Em Gigs architecture"
layout: default
parent: "Get 'Em Gigs"
grand_parent: Projects
nav_order: 2
description: "How the app in packages/getemgigs is structured, where it stores data, how it is deployed to Vercel, and which abuse controls it applies. Read this if you are deploying it or reusing the same stack."
---

# Get 'Em Gigs architecture
{: .no_toc }

How the app in `packages/getemgigs` is structured, where it stores data, how it is deployed to Vercel, and which abuse controls it applies. Read this if you are deploying it or reusing the same stack.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Runtime

The app is Next.js 15 with the App Router and React 19. Pages are server components that read the session cookie and query Postgres directly. Forms are small client components that call JSON route handlers under `src/app/api`.

Every route handler is wrapped by `route()` in `src/lib/session.js`. The wrapper rejects cross-origin mutations (any method except GET and HEAD) and returns errors as JSON. It adds a `Retry-After` header to 429 responses.

`next.config.mjs` sets these response headers on every path:

| Header | Value |
|:---|:---|
| `Content-Security-Policy` | `default-src 'self'` plus the narrow additions the app needs. Google reCAPTCHA hosts are added only when `NEXT_PUBLIC_RECAPTCHA_ENABLED` is `true`. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `camera=(self), geolocation=(), microphone=()`. The camera is for the check-in scanner. |

## Data

`src/lib/db.js` picks a driver at startup.

| Environment | Driver | Selected by |
|:---|:---|:---|
| Production and preview | `@neondatabase/serverless` over HTTP | `DATABASE_URL` (or `POSTGRES_URL`, or `NEON_DATABASE_URL`) is set |
| Local development and unit tests | `@electric-sql/pglite`, Postgres compiled to WebAssembly | No URL is set. Data is in memory unless `PGLITE_DIR` names a directory. |

With no URL set, a production Vercel environment throws instead of falling back to PGlite.

`src/lib/schema.js` is a list of idempotent `CREATE ... IF NOT EXISTS` statements. They run once per process start, followed by an insert of six venues if the `venues` table is empty. The tables are `users`, `sessions`, `bands`, `venues`, `gigs`, `agreements`, `attendance`, `ledger`, `stay_commitments`, `rate_limits` and `audit_log`.

Sessions use a random 32-byte token in the `gg_session` cookie. The database stores only its SHA-256 hash. Cookies are HttpOnly and SameSite=Lax, and are Secure in production. A session lasts 30 days. Passwords are hashed with bcrypt at cost 11.

## Abuse controls

Signup is open. These checks are in `src/lib/security.js`, `src/lib/services.js` and the route handlers.

| Control | Detail |
|:---|:---|
| Rate limits | A fixed-window counter in the `rate_limits` table, so limits hold across serverless instances. Signup is 5 per hour and 20 per day per IP, and 60 per minute for the whole site. Login is 30 per 15 minutes per IP and 10 per 15 minutes per email. Check-in code requests are 120 and scans are 40 per 10 minutes per user. |
| Daily caps | Per day: 10 gigs and 20 Buddy Gig offers per band, and 5 added venues per account. |
| Bot traps | A hidden `website` field must be empty, and a form must take at least 1.5 seconds to fill. |
| Input checks | A blocklist of 16 disposable email domains. Passwords need at least 10 characters, must not be on a short common-password list and must not contain the email name. Control characters are stripped. Request bodies over 20,000 bytes are refused. |
| Cross-site requests | `assertSameOrigin` compares the `Origin` header with the host. |
| Audit log | Sign-ups, logins, failed logins, check-in scans (accepted and rejected) and account deletions go to `audit_log`. |
| reCAPTCHA v3 | Wired in and off by default. It only runs when `RECAPTCHA_ENABLED=true` and `RECAPTCHA_SECRET_KEY` is set. |

The E2E suite can skip the limits and the honeypot by sending an `x-e2e-key` header equal to `E2E_BYPASS_KEY`, which must be at least 24 characters. Leave it unset in production unless you run the live tests.

## Environment variables

These are the keys in `.env.example`.

| Key | Purpose |
|:---|:---|
| `DATABASE_URL` | Neon Postgres connection string. Leave empty locally to use PGlite. |
| `CRON_SECRET` | Bearer secret for `/api/cron/settle`. |
| `E2E_BYPASS_KEY` | Optional. Lets the end-to-end tests skip rate limits and the honeypot. |
| `RECAPTCHA_ENABLED`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE` | Server-side reCAPTCHA settings. The minimum score defaults to 0.5. |
| `NEXT_PUBLIC_RECAPTCHA_ENABLED`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Browser-side reCAPTCHA settings. |

## Deployment

The steps below follow `packages/getemgigs/DEPLOYMENT.md`.

1. The RobOS monorepo holds the source of truth in `packages/getemgigs`. It is synced to `github.com/nddipiazza/thegigbandit`.
2. In that repository, the GitHub Actions workflow runs on pushes and pull requests to `main`. It installs with `npm ci` on Node 22, then runs `npm test` and `npm run build`.
3. The Vercel project `thegigbandit` deploys `main`.
4. Add the database with `vercel integration add neon`, which injects `DATABASE_URL`. Set `CRON_SECRET` and, if you use the live tests, `E2E_BYPASS_KEY` for Production and Preview.
5. `vercel.json` schedules `/api/cron/settle` at `0 11 * * *`, which is 11:00 UTC. Vercel sends the bearer secret from `CRON_SECRET`.
6. Check the deployment with `GET /api/health`. It runs `SELECT 1` and returns `{"ok":true,"db":"neon","captcha":false}`, or a 503 if the database is unreachable. The `db` value is `pglite` when no database URL is set.
