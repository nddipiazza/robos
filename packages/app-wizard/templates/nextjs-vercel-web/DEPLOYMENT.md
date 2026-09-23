# Deployment — __APP_NAME__

1. **Vercel project**: import this GitHub repo (framework: Next.js). Production deploys from `main`.
2. **Domain**: add `__DOMAIN__` and `www.__DOMAIN__`; canonical is `https://www.__DOMAIN__` (apex redirects).
   DNS: `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com`.
3. **Database**: `vercel integration add neon` (or Storage → Neon in the dashboard). It injects `DATABASE_URL`.
   The schema is created idempotently on first request.
4. **Env vars** (Production + Preview): `E2E_BYPASS_KEY`, optional `CRON_SECRET`, `RECAPTCHA_*`,
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION`.
5. **Verify**: `GET /api/health` → `{"ok":true,"db":"neon"}`; `/robots.txt`, `/sitemap.xml`, `/llms.txt`,
   `/opengraph-image`, `/manifest.webmanifest` all return 200.
6. **Evidence**: `npm run e2e:live && npm run evidence`.
