---
title: "5. Project 1: Building getemgigs.com (Web App to Chrome)"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 5
permalink: /training/for-non-developers/05-project-getemgigs-web-app.html
---

# Module 5: Project 1 — Building getemgigs.com (Web App to Chrome)
{: .no_toc }

A complete real-world case study: How a creator with zero coding experience uses RobOS to design, scaffold, implement, and run a production web application in Google Chrome.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The Vision: Ending Predatory Pay-To-Play for Indie Bands

Meet our first flagship project: **The Gig Bandit &amp; Get 'Em Gigs** ([`getemgigs.com`](https://www.getemgigs.com)).

If you've ever played in an indie garage band, you know the music industry's dirty secret:
1. Venues demand that bands bring 50 people.
2. Predatory promoters force bands to **pre-pay for tickets** out of their own pocket ("pay-to-play") and eat the loss if friends don't show up.
3. Friends and fellow musicians promise: *"Bro, I'm totally coming to your show!"* ...and then bail at 9:00 PM to watch Netflix.

We set out to fix this with two radical software concepts:
- **Buddy Gigs ("I'll come to your gig if you come to mine")**: Band A and Band B agree to cross-attend each other's concerts. Both bands put up an escrow deposit ($10–$100). If you show up at the venue door, your deposit is instantly refunded. If you flake, **the playing band keeps your cash**. Either you get a crowd, or you get paid!
- **Rotating Door QR Codes**: To prevent people from texting a screenshot of their ticket to a buddy at home, the door QR code rotates every 30 seconds with a cryptographic timestamp.

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/buddy-gig-escrow-flow.jpg' | relative_url }}" alt="Buddy Gig Escrow Lifecycle" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 5.1: The Buddy Gig attendance agreement and escrow deposit lifecycle.</em></p>
</div>

---

## Step 1: Onboarding the Web App in App Wizard

In **App Wizard**, we chose the **Web Application (Next.js / SSR)** archetype:
- **Name**: `getemgigs`
- **Domain**: `schema:WebApplication`, `robos:FrontEndApp`
- **Stack**: Next.js 15 App Router, React 19, TailwindCSS, Neon Serverless Postgres.

RobOS generated the clean project structure under `packages/getemgigs` and registered the node `urn:robos:app:getemgigs` in the Knowledge Graph.

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/architecture-diagram.jpg' | relative_url }}" alt="Get Em Gigs Architecture Diagram" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 5.2: System architecture of getemgigs.com running on Vercel and Neon Postgres.</em></p>
</div>

---

## Step 2: Context Engineering the Escrow Rules

Instead of trying to code banking logic by hand, we used **Context Engineering** to define the exact rules in plain English:

```json
{
  "dealRules": {
    "depositRange": "$10 to $100 per band",
    "lockCondition": "When reciprocal agreement accepted by both hosts",
    "checkInWindow": "From 1 hour before scheduled doors until 5 hours after",
    "qrCodeExpirySeconds": 30,
    "settlementCron": "Every morning at 06:00 CT",
    "defaultOutcome": "Flaked deposit forfeited to the band that played"
  }
}
```

Because these rules were explicitly registered in the Knowledge Graph, the AI agents never had to guess what happens when someone arrives 10 minutes late or forgets their phone.

---

## Step 3: Decomposing into DAG Tasks in Task Planner

In **Task Planner**, we used the interactive form to generate a 3-tier milestone plan:
1. **Task #1 (Core Data &amp; Escrow Engine)**: Neon Postgres schema for `users`, `bands`, `gigs`, and `escrow_deals`.
2. **Task #2 (Rotating QR Code API)**: Crypto token generator that invalidates QR codes after 30 seconds.
3. **Task #3 (Mobile-First Web UI)**: Responsive phone screens for browsing gigs, initiating trades, and displaying the live QR ticket.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step8-vercel_deployments_frame.png' | relative_url }}" alt="Vercel Deployments and GitOps Overview" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 5.1: Reviewing web app deployments and automated build pipelines.</em></p>
</div>

---

## Step 4: Running the Task Implementer in Sandboxes

We dispatched the tasks to the **Task Implementer**:
- The agent spun up an ephemeral `tmpfs` container.
- It wrote the Next.js routes under `app/api/deals/` and `app/deals/[id]/`.
- It created a complete automated test suite (`tests/escrow.test.js`) verifying:
  - Deposit locking on trade agreement.
  - Door QR verification with 30-second token rotation.
  - Automatic forfeiture of funds for no-shows at 06:00 CT.
- Result: **3 test suites, 6 tests, 100% passed!**

---

## Step 5: Running &amp; Testing in Google Chrome

Now for the best part: **using the app you just created!**

Because this is a web app, you can launch the local development server and open it directly in **Google Chrome**:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/acme-petshop-step1-chrome_gitea_frame.png' | relative_url }}" alt="Testing Web App in Google Chrome" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 5.2: Running and testing your web application directly inside Google Chrome.</em></p>
</div>

### How to Test Like a Pro in Chrome (Mobile Emulation)
1. Open Google Chrome to `http://localhost:3000` (or visit the live deployment at [getemgigs.com](https://www.getemgigs.com)).
2. Press `F12` (or right-click &rarr; **Inspect**) to open Chrome Developer Tools.
3. Click the **Toggle Device Toolbar** icon (`Ctrl+Shift+M` or `Cmd+Shift+M`) to switch to **Mobile Emulation** (e.g. iPhone 14 Pro or Pixel 7).
4. Watch the mobile layout snap into place:
   - Click **Find a Buddy Gig**.
   - Review an incoming deal and click **Accept &amp; Lock Deposit**.
   - Click **Show Door QR Code** and watch the QR code refresh its cryptographic hash every 30 seconds!

You just built and verified a full-scale production web application with escrow economics, database storage, and mobile device rendering without writing a single line of JavaScript!

---

Ready to step into the world of game development?

Proceed to **[Module 6: Project 2 — Building crpg-realm (Your First Video Game)]({{ '/training/for-non-developers/06-project-crpg-realm-game.html' | relative_url }})**!
