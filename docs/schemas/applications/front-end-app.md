---
title: Front End App
layout: default
parent: Applications
grand_parent: Schemas
nav_order: 5
permalink: /schemas/applications/front-end-app.html
---

# robos:FrontEndApp
{: .no_toc }

Validation shape for `robos:FrontEndApp` nodes in the `applications` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:FrontEndApp` |
| Shape id | `urn:robos:shape:FrontEndAppShape` |
| Package | [Applications]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:WebApplication`](https://schema.org/WebApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Front End App must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Front End App must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Front End App must specify technology stack. |
| `robos:frontendFramework` | `1..*` | `xsd:string` | Front End App must declare frontend framework (React, Vue, Next.js, Angular, Svelte). |
| `robos:appTemplate` | `0..*` | `xsd:string` | Template the app was generated from; optional for hand-built apps. |
| `robos:hostingPlatform` | `0..*` | `xsd:string` | Production hosting platform. |
| `robos:productionUrl` | `0..*` | `xsd:string` | Canonical production URL. |
| `robos:databaseEngine` | `0..*` | `xsd:string` | Primary datastore. |
| `robos:authStrategy` | `0..*` | `xsd:string` | Authentication approach. |
| `robos:abuseControls` | `0..*` | `xsd:string` | Abuse and bot protections. |
| `robos:captchaProvider` | `0..*` | `xsd:string` | CAPTCHA integration and whether it is enabled. |
| `robos:crawlerPolicy` | `0..*` | `xsd:string` | robots.txt policy for search engines and AI agents. |
| `robos:sitemapUrl` | `0..*` | `xsd:string` | XML sitemap URL. |
| `robos:llmsTxtUrl` | `0..*` | `xsd:string` | llms.txt summary for AI agents. |
| `robos:structuredData` | `0..*` | `xsd:string` | schema.org JSON-LD types emitted. |
| `robos:e2eEvidence` | `0..*` | `xsd:string` | E2E evidence video location. |

## Example node

This node comes from `.robos/kgraphs/applications/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:frontend-app:urban-plant-tracker",
  "@type": [
    "oslc_am:Resource",
    "robos:FrontEndApp",
    "schema:WebApplication"
  ],
  "dcterms:title": "Urban Plant Tracker",
  "dcterms:description": "Smart indoor plant care companion with automated watering reminders, botanical light logs, and care guides.",
  "robos:package": "applications",
  "robos:namespace": "robos.applications",
  "robos:repository": "github.com/nddipiazza/urban-plant-tracker",
  "robos:technology": "Next.js 15 / React 19 / Node.js 22",
  "robos:frontendFramework": "Next.js",
  "robos:appTemplate": "robos:template:nextjs-vercel-web@1",
  "robos:hostingPlatform": "Vercel",
  "robos:productionUrl": "https://www.urbanplanttracker.com",
  "robos:databaseEngine": "Neon serverless Postgres (PGlite locally)",
  "robos:authStrategy": "Email + password, server-side sessions (bcrypt, SHA-256 hashed tokens)",
  "robos:abuseControls": [
    "rate-limits",
    "honeypot",
    "form-timing",
    "disposable-email-block",
    "password-policy",
    "same-origin-csrf",
    "csp",
    "audit-log"
  ],
  "robos:captchaProvider": "reCAPTCHA v3 (wired, disabled)",
  "robos:crawlerPolicy": "Search engines, AI search/agents and link-preview bots allowed on public pages; /api, /dashboard, /account disallowed",
  "robos:sitemapUrl": "https://www.urbanplanttracker.com/sitemap.xml",
  "robos:llmsTxtUrl": "https://www.urbanplanttracker.com/llms.txt",
  "robos:structuredData": [
    "schema:Organization",
    "schema:WebSite",
    "schema:WebApplication",
    "schema:FAQPage"
  ],
  "robos:e2eEvidence": "tests/e2e (Cucumber + Playwright) → npm run evidence",
  "robos:schemaOrgType": "https://schema.org/WebApplication",
  "robos:domainStandard": "https://schema.org/WebApplication"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
