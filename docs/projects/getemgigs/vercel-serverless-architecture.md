---
title: Vercel Serverless & Edge Architecture
layout: default
parent: The Gig Bandit & Get 'Em Gigs
grand_parent: RobOS Projects
nav_order: 3
---

# Vercel Serverless & Edge Architecture
{: .no_toc }

A technical overview of the Next.js 15 App Router architecture, zero-cost persistent storage tiers, and automated GitHub Actions CI/CD deployed to `getemgigs.com`.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Edge & Serverless Architecture

The Gig Bandit is engineered for zero maintenance and zero operational hosting costs on Vercel's free hobby tier:

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/vercel-edge-architecture.jpg' | relative_url }}" alt="The Gig Bandit Vercel Edge and Serverless Architecture" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure: Vercel Anycast Edge CDN, Next.js 15 App Router, Serverless Edge APIs, and pluggable zero-cost database tiers.</em></p>
</div>

---

## 2. GitHub Actions CI/CD Pipeline

Every push to the `main` branch undergoes automated validation before deployment:

```yaml
name: CI & Vercel Deployment

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify-and-test:
    name: Lint, Test & Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci || npm install
      - run: npm test
      - run: npm run build

  deploy-vercel:
    needs: verify-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
```

---

## 3. Custom Domain Configuration (`getemgigs.com`)

To map `getemgigs.com` to Vercel:
1. **Apex Record**: `A` record pointing `@` &rarr; `76.76.21.21`
2. **Subdomain Record**: `CNAME` record pointing `www` &rarr; `cname.vercel-dns.com`
3. Vercel provisions Let's Encrypt TLS certificates with automated renewals.
