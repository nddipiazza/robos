---
title: "Dev Central"
package: dev-central
category: core-desktop
icon: dev-central.svg
summary: "Daily developer engineering command center: sprint burndown, PR health, calendar, and AI standup."
---

Your daily engineering cockpit and mission control hub for the entire Software Delivery Lifecycle (SDLC). Dev Central aggregates in-flight tasks, sprint commitments, pull request health, reviewer queues, blocker early warnings, and automated daily standup synthesis into a single high-density desktop cockpit:

- **Executive 5-Metric KPI Ribbon**: Real-time visibility into assigned tasks, open pull requests, pending code reviews, active blocker radar alerts, and aggregate CI/CD pipeline health percentage.
- **Context-Aware View Tabs**: Fast switching between unified Mission Control, dedicated Tasks & Sprint, Pull Requests & CI, Blocker Radar, AI Standup, and Live Desktop Activity logs.
- **Lifecycle Status Chips & Fuzzy Command Search (`⌘K`)**: Instant status filtering (`All`, `In Progress`, `Review`, `Todo`) and millisecond-fast fuzzy search across work items, branch names, and microservices.
- **Automated 3-Column AI Standup Generator**: Analyzes recently merged PRs (Yesterday), assigned sprint work (Today), and detected pipeline roadblocks (Blockers) with single-click clipboard export for daily team standup syncs.
- **Blocker Early Warning Radar**: Proactive automated detection of failed CI pipelines, stale code review requests (>24h), and stagnant work items (>3d) before they derail sprint velocity.
- **Interactive Proof-of-Work Review & 1-Click Production Merge**: High-fidelity verification modal with 4 automated quality gates (Pact consumer contracts, W3C SHACL shape conformance, Spectral OpenAPI 3.1 linting, E2E regressions), 1080p recorded video walkthrough with interactive chapter bookmarks, side-by-side diffs, and 1-click merge to `main` promoting feature state to Production Reality.

| Executive Mission Control Dashboard (`dev-central-overview.png`) | Interactive Proof-of-Work Review & Quality Gates (`dev-central-review-modal.png`) |
|:---:|:---:|
| ![Dev Central Overview]({{ '/assets/images/screenshots/dev-central-overview.png' | relative_url }}) | ![Interactive Proof-of-Work Review Modal]({{ '/assets/images/screenshots/dev-central-review-modal.png' | relative_url }}) |

| My Tasks & Sprint with Lifecycle Filter Chips (`dev-central-tasks-filtered.png`) | Pull Requests & CI Pipeline Health (`dev-central-prs-view.png`) |
|:---:|:---:|
| ![Tasks & Lifecycle Filter Chips]({{ '/assets/images/screenshots/dev-central-tasks-filtered.png' | relative_url }}) | ![Pull Requests & CI View]({{ '/assets/images/screenshots/dev-central-prs-view.png' | relative_url }}) |

| Blocker Early-Warning Radar (`dev-central-blocker-radar.png`) | Real-Time Fuzzy Command Search (`dev-central-search.png`) |
|:---:|:---:|
| ![Blocker Radar]({{ '/assets/images/screenshots/dev-central-blocker-radar.png' | relative_url }}) | ![Fuzzy Command Search]({{ '/assets/images/screenshots/dev-central-search.png' | relative_url }}) |

| Automated 3-Column AI Standup Notes (`dev-central-standup.png`) | 1-Click Sign-Off & Production Reality Merge (`dev-central-merged-reality.png`) |
|:---:|:---:|
| ![AI Standup Summary]({{ '/assets/images/screenshots/dev-central-standup.png' | relative_url }}) | ![Production Reality Merged]({{ '/assets/images/screenshots/dev-central-merged-reality.png' | relative_url }}) |
