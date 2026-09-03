---
nav_exclude: true
---

# Story 29.02: Multi-Panel Dashboard & Navigation UI

**Epic:** Dev Central — AI Agent Review-Based Development Hub
**Points:** 8
**Status:** Not started

## Description
Overhaul the frontend UI of `packages/dev-central` into a command hub featuring a dark-themed sidebar, active review badges, status counters, and views for Organizations, Projects, Plan Review, Swarm Monitor, Walkthroughs, and Blocker Radar.

## Tasks
- [ ] Design and implement responsive sidebar navigation in `renderer/index.html` and `renderer/style.css`.
- [ ] Add dynamic badge counters for pending plans (🔴), active swarms (🐝), ready walkthroughs (🟡), and blockers (🚨).
- [ ] Implement smooth tab/panel switching in `renderer/app.js` with state retention.
- [ ] Integrate RobOS global status bar (active VM status, active task server, live clock).
