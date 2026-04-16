---
title: "Phases 7-8: Dashboards"
layout: default
parent: The Model Problem
nav_order: 6
---

# Phases 7-8: Dashboards & Visibility
{: .no_toc }

Every team member sees real-time progress — no manual reporting needed.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Dana's Manager Dashboard

<img src="{{ '/assets/images/icons/manager-dashboard.svg' | relative_url }}" alt="Manager Dashboard" style="width: 32px; height: 32px; vertical-align: middle;"> **App: Manager Dashboard**

Dana opens the Manager Dashboard and sees a real-time view of the entire project:

![Manager Dashboard]({{ '/assets/images/screenshots/manager-dashboard.png' | relative_url }})

### Sprint Board

```
Buildbarn Forms — Sprint 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Backlog (4)          In Progress (1)    Deployed (5)
┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│ BBF-5        │    │ BBF-8        │   │ BBF-1 ✅     │
│ Scheduler    │    │ JSON/YAML    │   │ Proto parser │
│ form         │    │ export       │   ├──────────────┤
├──────────────┤    │ Alex         │   │ BBF-2 ✅     │
│ BBF-6        │    └──────────────┘   │ Form renderer│
│ Browser form │                       ├──────────────┤
├──────────────┤                       │ BBF-3 ✅     │
│ BBF-9        │                       │ Worker form  │
│ Storybook    │                       ├──────────────┤
├──────────────┤                       │ BBF-4 ✅     │
│ BBF-10       │                       │ Storage form │
│ npm publish  │                       ├──────────────┤
└──────────────┘                       │ BBF-7 ✅     │
                                       │ Validation   │
                                       └──────────────┘
```

### Velocity & Metrics

| Metric | Value |
|:-------|:------|
| Stories completed this sprint | 5/10 |
| Average cycle time | 1.8 days (In Progress → Deployed) |
| Average review cycles | 1.2 |
| AI draft acceptance rate | 85% (minimal human edits) |
| On track for sprint completion | Yes |

### Deployment Tracker

| Version | Date | Stories | Status |
|:--------|:-----|:--------|:-------|
| v1.3.0 | Mar 21 | BBF-3 (Worker form) | ✅ Deployed |
| v1.2.0 | Mar 20 | BBF-4 (Storage form) | ✅ Deployed |
| v1.1.0 | Mar 18 | BBF-7 (Validation engine) | ✅ Deployed |
| v1.0.0 | Mar 15 | BBF-1, BBF-2 (Core) | ✅ Deployed |

---

## Pat's Product Dashboard

<img src="{{ '/assets/images/icons/dev-central.svg' | relative_url }}" alt="Dev Central" style="width: 32px; height: 32px; vertical-align: middle;"> **App: Dev Central**

Pat sees the product-focused view:

![Dev Central]({{ '/assets/images/screenshots/dev-central.png' | relative_url }})

### Epic Progress

```
Buildbarn Forms Component Library
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Progress: ██████████████░░░░░░ 50% (5/10 stories deployed)

High Priority:  4/5 done ✅  (BBF-1, 2, 3, 7 done; BBF-8 in progress)
Medium Priority: 1/3 done    (BBF-10 done; BBF-5 backlog)
Low Priority:    0/2         (BBF-6, BBF-9 backlog)
```

### Recently Deployed

- **BBF-3 Worker Config Form** — Alex — deployed Mar 21 at 14:40
  - *"Platform engineers can now edit worker configs through a validated form with collapsible sections and runner type selection."*
- **BBF-4 Storage Config Form** — Alex — deployed Mar 20 at 16:10
  - *"Storage blobstore, AC, and CAS configuration forms with nested proto field editing."*

---

## Jordan's Dev Lead View

<img src="{{ '/assets/images/icons/pr-review.svg' | relative_url }}" alt="PR Review Board" style="width: 32px; height: 32px; vertical-align: middle;"> **App: Dev Central + PR Review Board**

### Review Activity (This Sprint)

| PR | Story | Author | Cycles | Time to Approve |
|:---|:------|:-------|:-------|:----------------|
| #12 | BBF-3 Worker form | Alex | 1 | 2h 50m |
| #11 | BBF-4 Storage form | Alex | 1 | 1h 30m |
| #10 | BBF-7 Validation | Alex | 2 | 4h 15m |
| #9 | BBF-2 Form renderer | Alex | 1 | 2h 00m |

### CI Health

- Last 10 builds: 9 passing, 1 failed (auto-fixed by agent)
- Test coverage: 87%
- Build time trend: stable at ~2 minutes

---

## Alex's Developer Dashboard

### My Current Work

```
● BBF-8: JSON/YAML Export — In Progress
  Branch: feat/bbf-8-export
  AI Draft: In questionnaire phase
  Time in stage: 25 minutes
```

### Work Journal (auto-captured)

```
2026-03-21
  09:15  Started BBF-3 (Worker Config Form)
  09:20  AI questionnaire: answered 2 questions about form layout
  09:45  AI draft complete: 5 files created
  10:30  Human review complete, minor tweaks applied
  11:30  PR #12 created, CI running
  14:20  PR #12 approved by Jordan
  14:25  PR #12 merged
  14:40  v1.3.0 deployed with BBF-3
  15:00  Started BBF-8 (JSON/YAML Export)
```

{: .tip }
The Work Journal captures every developer action automatically — no manual time tracking or status updates needed.

---

## Notification Summary

Throughout the entire lifecycle, the Event Bus delivers targeted notifications:

| Event | Who Gets Notified | Tier |
|:------|:------------------|:-----|
| Task started | Dana (dashboard update) | info |
| PR created | Jordan (reviewer) | warning |
| CI failed | Alex (author) | critical |
| Review: changes requested | Alex (author) | warning |
| Review: approved | Alex (author) | info |
| Deploy complete | Alex, Jordan, Dana, Pat | info |
