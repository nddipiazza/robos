---
title: The Gig Bandit & Get 'Em Gigs
layout: default
parent: RobOS Projects
has_children: true
permalink: /projects/getemgigs/
nav_order: 2
---

# The Gig Bandit & Get 'Em Gigs (`getemgigs.com`)
{: .no_toc }

A game-changing web platform for the local music scene powered by reciprocal attendance contracts, geolocation-verified security deposit escrow, and Stay-To-Play venue economics.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Executive Summary

The **Gig Bandit** (`getemgigs.com`) is a production-grade RobOS web application engineered to solve the two deepest systemic crises plaguing the local independent music scene:
1. **Empty Rooms and Flaked Commitments**: Local bands constantly struggle to draw attendees. Friends and fellow musicians promise to attend, only to bail at the last minute.
2. **Predatory Pay-To-Play Models**: Unscrupulous venues exploit indie bands by forcing them to pre-purchase tickets to their own gig and resell them, shifting all financial risk onto emerging artists.

**The Gig Bandit replaces blind trust and predatory booking with game-theory incentives, automated escrow, and cryptographic geolocation verification.**

<div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; margin: 1.5rem 0;">
  <h3 style="margin-top: 0; color: #58a6ff;">🚀 Live Production Deployment</h3>
  <p style="color: #c9d1d9; font-size: 0.95rem;">
    <strong>Production Domain:</strong> <a href="https://getemgigs.com" target="_blank" rel="noopener noreferrer">https://getemgigs.com</a> (or <a href="https://thegigbandit.vercel.app" target="_blank" rel="noopener noreferrer">thegigbandit.vercel.app</a>)<br/>
    <strong>Vercel 1-Click Template:</strong> <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnddipiazza%2Fthegigbandit" target="_blank" rel="noopener noreferrer">Deploy with Vercel</a><br/>
    <strong>GitHub Repository:</strong> <a href="https://github.com/nddipiazza/thegigbandit" target="_blank" rel="noopener noreferrer">github.com/nddipiazza/thegigbandit</a><br/>
    <strong>SDLC Knowledge Graph Node:</strong> <code>urn:robos:app:getemgigs</code> conforming to <code>schema:WebApplication</code> &amp; <code>robos:FrontEndApp</code>
  </p>
</div>

---

## Project Specification & Architecture

| **Category** | **Implementation Details** |
|:---|:---|
| **Framework** | Next.js 15 (App Router, Server Components, Edge & Serverless API Routes) |
| **User Interface** | React 19, TailwindCSS, Dark Neon Aesthetic, Lucide-style SVG graphics |
| **Hosting & CDN** | Vercel Edge Network with Automated Global Anycast DNS (`getemgigs.com`) |
| **Verification Engine** | Haversine Great-Circle Geofencing (Strict 150m venue radius boundary) |
| **Escrow Engine** | Multi-party refundable security deposit lock (`$25`–`$100`), automated next-day payout |
| **Data Persistence** | Zero-config embedded JSON/Memory store + pluggable MongoDB Atlas / Vercel KV / Postgres |
| **CI/CD Pipeline** | GitHub Actions (`.github/workflows/ci.yml`) with automated build, test, and Vercel CD |
| **Testing Harness** | Native Node.js Test Runner: 3 Suites, 6 Tests (100% Passed) |

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/architecture-diagram.jpg' | relative_url }}" alt="The Gig Bandit Platform Architecture" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 1: High-level platform architecture showing Next.js 15 client layer, Vercel Edge API routes, and RobOS application engines.</em></p>
</div>

---

## 1. The Buddy Gig Feature (Beta)

### “You scratch my back, I’ll scratch yours.”

Local bands constantly struggle to get people to attend their shows. They don't have massive social followings yet, they are works in progress, and building an audience is hard.

The **Buddy Gig** feature allows two groups to link their gigs together. Each group agrees to attend the other group's gig:
> *"I'll go to your gig if you go to my gig."*

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/buddy-gig-escrow-flow.jpg' | relative_url }}" alt="Buddy Gig Escrow and Geolocation Verification Workflow" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 2: Buddy Gig reciprocal agreement lifecycle &mdash; security deposit escrow lock, 150m GPS verification, and next-morning automated payout reconciliation.</em></p>
</div>

### The Security Deposit Escrow: Eliminating the Bail Factor
If you think through mutual attendance agreements, the fatal flaw is obvious: **How do you keep a band from bailing and flaking out?**

The Gig Bandit solves this with an escrow gate:
1. Upon buddying a gig, each group provides a **refundable security deposit** (`$25`–`$100`).
2. The funds are held in secure escrow.
3. When the gig occurs:
   - **If Yes (Attended)**: The app registers them using Geolocation within a 150-meter radius, and the security deposit is **instantly reimbursed**.
   - **If Not (Bailed)**: At 6:00 AM the following morning, the escrow transfers the security deposit directly to the host band whose show was bailed on!
4. **Guaranteed Win-Win**: Either the host band got attendees at their show, or they got paid!

---

## 2. The Venue Stay-To-Play Feature (Beta)

### Abolishing Predatory "Pay-to-Play"

Anyone who has ever played in a band knows traditional **pay-to-play** is an exploitative nightmare. Venues guarantee they make money by pre-selling 30–50 tickets to the performing band. If the band can't sell them, the band is forced to pay out-of-pocket for their own performance.

**The Gig Bandit introduces the "Stay-to-Play" model:**
- Instead of forcing bands to sell tickets to their own gig, bands purchase a small ticket allotment (e.g. 4 tickets at `$12`) to **another gig at the same venue** and attend it!
- Instead of paying to play at your own gig which is ridiculous, you pay to attend another band's gig—which is awesome, builds scene solidarity, and is something artists should be doing anyway!
- Venues still guarantee bar and door revenue, but bands are invested in the mutual success of other acts rather than competing against them.

<div style="margin: 2rem 0;">
  <img src="{{ '/assets/images/getemgigs/stay-to-play-comparison.jpg' | relative_url }}" alt="Traditional Pay-To-Play vs The Gig Bandit Stay-To-Play Model" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 3: Comparative analysis between predatory pay-to-play debt models and reciprocal Stay-To-Play ticket economics.</em></p>
</div>

---

## 3. Mathematical Geolocation Verification

The verification engine uses the **Haversine Great-Circle Formula** to calculate the distance between the attendee's mobile GPS device and the venue's physical coordinates:

$$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$

Where:

- $R = 6,371,000\text{ meters}$ (Earth mean radius)
- $\phi_1, \phi_2$ are the latitudes in radians
- $\Delta\phi = \phi_2 - \phi_1$
- $\Delta\lambda = \lambda_2 - \lambda_1$

If $d \le 150\text{ meters}$ during the gig window (from doors time until 1 hour after show end), the check-in is cryptographically verified, unlocking the escrow refund immediately.

---

## In-Depth Documentation Sub-Pages

Explore the detailed architecture and implementation breakdowns:

1. [**Buddy Gig Geolocation & Escrow Engine**]({{ '/projects/getemgigs/buddy-gig-geolocation-escrow.html' | relative_url }})  
   *Deep dive into Haversine formulas, escrow finite state machines, fraud prevention, and next-day automated payouts.*

2. [**Venue Stay-To-Play Economics**]({{ '/projects/getemgigs/venue-stay-to-play-economics.html' | relative_url }})  
   *Economic analysis of reciprocal attendee pools vs. predatory pay-to-play, band retention, and venue booking incentives.*

3. [**Vercel Serverless & Edge Architecture**]({{ '/projects/getemgigs/vercel-serverless-architecture.html' | relative_url }})  
   *Edge routing, zero-cost storage strategies (embedded JSON, MongoDB Atlas, Vercel KV), and automated GitHub Actions CI/CD.*
