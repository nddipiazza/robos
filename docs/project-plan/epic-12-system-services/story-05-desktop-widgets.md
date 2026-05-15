---
nav_exclude: true
---

# Story 12-05: Desktop Widgets

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Status overlay widgets that sit on the desktop behind windows. Show at-a-glance info: AI quota usage, current task status, pass/GPG status, quick journal summary, system resource usage. Implemented as either GTK3 Python overlays or an Electron window with _NET_WM_WINDOW_TYPE_DESKTOP. Configurable: show/hide individual widgets, position.

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
