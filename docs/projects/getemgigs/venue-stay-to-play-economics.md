---
title: Venue Stay-To-Play Economics
layout: default
parent: The Gig Bandit & Get 'Em Gigs
grand_parent: RobOS Projects
nav_order: 2
---

# Venue Stay-To-Play Economics
{: .no_toc }

A comparative economic analysis of traditional pay-to-play versus the Stay-To-Play reciprocal ticketing model introduced by The Gig Bandit (`getemgigs.com`).
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. The Pay-To-Play Trap

In traditional indie venue booking, the financial equation places 100% of the downside risk on the performing artists:

| Metric | Traditional Pay-To-Play | Stay-To-Play Model |
|:---|:---|:---|
| **Upfront Financial Risk** | **$360–$600 per band** (30–50 presale tickets) | **$48–$60 per band** (4–5 tickets to sister show) |
| **Attendance Incentive** | Hard sell to reluctant friends | Band members attend in person + bring crew |
| **Peer Dynamics** | Competitive & stressful ticket pushing | Mutual support, scene building, cross-pollination |
| **Bar Revenue Impact** | Low (friends show up late, leave early) | High (artists stay all night to support fellow acts) |
| **Band Churn Rate** | > 75% burnout after 2 gigs | < 12% churn with reciprocal bookings |

---

## 2. Reciprocal Ticket Pool Math

In Stay-To-Play:
- Venue partners establish a **reciprocal booking pool**.
- Band A buys 4 tickets (`$12` each = `$48`) to Band B's Thursday night gig and attends.
- Band B buys 4 tickets to Band A's Saturday night gig and attends.
- The venue collects `$96` in ticket sales across both dates, plus **guaranteed beverage sales** from engaged musicians spending the evening at the venue.
- Both bands perform to rooms with confirmed, enthusiastic fellow artists in the front row.

```mermaid
graph LR
    subgraph VENUE_BENEFITS ["Venue Economics"]
        Door["Stable Door Revenue"]
        Bar["Higher Bar & Food Tab"]
        Retention["Loyal Artist Network"]
    end

    subgraph BAND_BENEFITS ["Artist Economics"]
        NoRisk["Zero Unsold Ticket Debt"]
        Reciprocal["Guaranteed Peer Audience"]
        Camaraderie["Creative Collaboration"]
    end

    STP["Stay-To-Play Pool"] --> VENUE_BENEFITS
    STP --> BAND_BENEFITS
```
