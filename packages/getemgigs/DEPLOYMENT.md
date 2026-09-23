# Deployment

Vercel project `thegigbandit` deploys from `main` of github.com/nddipiazza/thegigbandit.
Source of truth lives in the RobOS monorepo at `packages/getemgigs` and is synced here.

1. Database: Neon via Vercel Marketplace (`vercel integration add neon`) — injects `DATABASE_URL`.
   Schema is created idempotently on first request (`src/lib/schema.js`).
2. Env vars (Production + Preview): `CRON_SECRET`, `E2E_BYPASS_KEY`; reCAPTCHA vars when enabling it.
3. Cron: `vercel.json` schedules `/api/cron/settle` daily at 11:00 UTC (06:00 CT).
4. Domains: `getemgigs.com`, `www.getemgigs.com`.
5. Health: `GET /api/health` → `{"ok":true,"db":"neon"}`.
