---
title: Front-end apps
layout: default
parent: Building apps
grand_parent: Build on RobOS
nav_order: 3
---

# Front-end apps
{: .no_toc }

What RobOS gives you for a web application: the Next.js project the App Wizard generates, the commands to run and test it, and the `robos:FrontEndApp` node that records it in the knowledge graph. This is the only archetype with a full template today.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## Generate a web app

In the [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}), choose the **Modern Website / Web App** card. Fill in **Project Name**, **What does this project do?**, **Catchy Tagline** and, in Advanced Mode, **Custom Domain Name (Optional)** and **Search Keywords**. These values go into the hero text, page metadata, the Open Graph image, `public/llms.txt` and the schema.org markup. If you leave the domain empty it defaults to `<slug>.com`.

The template is `packages/app-wizard/templates/nextjs-vercel-web`. The wizard writes it to `packages/<slug>/`, along with `catalog-info.yaml` and `dev-setup.sh`. It does not overwrite template files that already exist.

The template was distilled from the getemgigs.com app, which is in this repository as `packages/getemgigs`. `packages/urban-plant-tracker` is the output of the wizard's Urban Plant Tracker starter. See [Get 'Em Gigs]({{ '/projects/getemgigs/' | relative_url }}) for the production app.

## What the template contains

| Area | Contents |
|:---|:---|
| Stack | Next.js 15 App Router and React 19, with plain CSS laid out for phones first (bottom tab bar, safe-area insets, 16px inputs). |
| Database | Neon serverless Postgres when `DATABASE_URL` is set. Otherwise an embedded PGlite database, which is in-memory unless `PGLITE_DIR` is set. The schema is in `src/lib/schema.js` and is created on first use. |
| Accounts | Email and password with bcrypt, server-side sessions that store a SHA-256 hash of the token, and account deletion. Pages: sign up, log in, dashboard, account, terms, privacy. |
| Abuse controls | Rate limits stored in Postgres, a honeypot field with a minimum form-fill time, a disposable-email block list, password rules, same-origin checks on API posts, and an audit log table. |
| CAPTCHA | reCAPTCHA v3 is wired in but disabled until you set the `RECAPTCHA_*` variables. |
| Security headers | Content-Security-Policy, `X-Frame-Options: DENY`, Permissions-Policy and HSTS, set in `next.config.mjs`. |
| Search and AI agents | `src/app/robots.js`, `sitemap.js`, `public/llms.txt`, canonical URLs, Open Graph and Twitter tags, generated icons and OG image, a web manifest, and JSON-LD for Organization, WebSite, WebApplication and FAQPage. |
| Tests | Unit tests with the Node.js test runner in `tests/unit`, and Cucumber with Playwright features in `tests/e2e/features`: sign-up, search and crawlers, abuse controls. |
| Deploy | `vercel.json`, a GitHub Actions workflow that runs `npm test` and `npm run build`, and `DEPLOYMENT.md`. |

{: .important }
`src/app/robots.js` allows AI search and agent crawlers and also the AI training crawlers (GPTBot, ClaudeBot, CCBot and others) on public pages. A comment in the file says which entries to move into a disallow rule if you want to opt out of training. Decide this before you deploy.

## Run it

From `packages/<slug>/`:

```bash
npm install
npm run dev     # http://localhost:3000, embedded PGlite, no database setup
npm test        # unit tests
```

The generated `dev-setup.sh` does the install, creates `.env.local` from `.env.example` with a random `E2E_BYPASS_KEY`, installs Chromium for Playwright and runs `npm test`.

End-to-end tests need a running server and a browser:

```bash
npx playwright install chromium
npm run build && npm start &
E2E_BYPASS_KEY=<24 or more characters> npm run e2e
npm run evidence
```

`npm run e2e` runs the Cucumber features against `http://localhost:3000`, or against `BASE_URL` if you set it. `npm run e2e:live` runs them against `https://www.<domain>`. `npm run evidence` encodes the recorded frames and builds the evidence videos; it needs `ffmpeg` on the path.

## Environment variables

| Variable | Purpose |
|:---|:---|
| `DATABASE_URL` | Neon connection string. Empty means embedded PGlite. |
| `E2E_BYPASS_KEY` | At least 24 characters. Sent as `x-e2e-key` so test runs skip rate limits and the honeypot. Set it in Vercel too if you run `e2e:live`. |
| `CRON_SECRET` | Bearer secret for any Vercel Cron routes you add. |
| `RECAPTCHA_ENABLED`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_MIN_SCORE`, `NEXT_PUBLIC_RECAPTCHA_ENABLED`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | reCAPTCHA v3. Disabled by default. |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Search Console and Bing verification tags. |

`DEPLOYMENT.md` in the generated project lists the Vercel steps: import the repository, add the domain, add Neon with `vercel integration add neon`, and set these variables.

## The knowledge graph node

The wizard adds a `robos:FrontEndApp` node to the `applications` package under `.robos/kgraphs/`. The SHACL shape `urn:robos:shape:FrontEndAppShape` requires four properties; the rest are optional and record what the template sets up.

| Required | Optional |
|:---|:---|
| `dcterms:title`, `robos:repository`, `robos:technology`, `robos:frontendFramework` | `robos:appTemplate`, `robos:hostingPlatform`, `robos:productionUrl`, `robos:databaseEngine`, `robos:authStrategy`, `robos:abuseControls`, `robos:captchaProvider`, `robos:crawlerPolicy`, `robos:sitemapUrl`, `robos:llmsTxtUrl`, `robos:structuredData`, `robos:e2eEvidence` |

A node the wizard writes looks like this, trimmed:

```json
{
  "@id": "urn:robos:frontend-app:urban-plant-tracker",
  "@type": ["oslc_am:Resource", "robos:FrontEndApp", "schema:WebApplication"],
  "dcterms:title": "Urban Plant Tracker",
  "robos:repository": "github.com/nddipiazza/urban-plant-tracker",
  "robos:technology": "Next.js 15 / React 19 / Node.js 22",
  "robos:frontendFramework": "Next.js",
  "robos:appTemplate": "robos:template:nextjs-vercel-web@1",
  "robos:hostingPlatform": "Vercel"
}
```

The `robos:repository` value is always `nddipiazza/<slug>` because the wizard does not ask for one. Change it to your repository.

## Other frameworks

The wizard generates only the Next.js template. Pick Vite, Vue, Svelte, Angular or another framework and you still get that template. The [import wizard]({{ site.baseurl }}{% link app-import-wizard.md %}) does recognise existing projects that depend on Vite, Next.js, Nuxt, Vue, Svelte, Angular or `react-scripts`, and classifies them as front-end apps. Its detection reads only the top-level `package.json`.

When you improve the template in a real app, `AGENTS.md` asks you to port the change back into the template, bump `TEMPLATE_VERSION` in `packages/app-wizard/lib/generate-app.js`, and keep `packages/robos-test/tests/app-wizard/generate-app.test.js` passing.
