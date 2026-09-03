---
nav_exclude: true
---

# Story: Desktop Widgets — Status Overlays

**Epic:** [System Services & Desktop Integration](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Status overlay widgets that sit on the desktop behind windows or run as an interactive overlay dashboard. Show at-a-glance info:
- Active task status (`~/.config/robos/active-issue`)
- System resource telemetry (RAM usage, Disk storage, CPU cores & load average, Uptime)
- AI Quota & Agent session state
- Work Journal & Knowledge Graph sync status
- Security & Pass/GPG encryption state

Configurable: show/hide individual widgets with real-time toggle pills and disk persistence in `~/.config/robos/widgets.json`.

## Acceptance Criteria

- [x] Displays real-time Active Task, System Resources, AI Quota, Work Journal, and Security widgets
- [x] Supports interactive toggle chips for enabling/disabling widgets with live layout reflow
- [x] Integrates with other RobOS apps via IPC (`get-widget-data`, `get-widget-config`, `save-widget-config`, `widget-data` event stream)
- [x] Follows RobOS dark theme and desktop conventions
- [x] Runs reliably in both desktop background mode and interactive control overlay
- [x] Verified with automated E2E tests (`packages/robos-test/tests/desktop-widgets/e2e.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/desktop-widgets/`.
