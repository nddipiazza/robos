---
nav_exclude: true
---

# Story: robos-cli Tools — Notify, Active Task, Journal, Events

**Epic:** [System Services & Desktop Integration](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

CLI utilities installed to `/usr/local/bin/`. Used by agent scheduler, CI scripts, event rules, and other automation:
- `robos-notify`: Send categorized & tiered desktop notifications with JSON stdin support.
- `robos-active-task`: Get, set, and clear the session's active task (`~/.config/robos/active-issue`).
- `robos-journal-append`: Append notes, decisions, and tasks directly to the Git daily journal.
- `robos-event`: Emit events, stream live NDJSON events, and query historical event logs.

Also includes the interactive Electron **RobOS CLI Console & Test Runner** (`packages/robos-cli`) for real-time testing and visualization.

## Acceptance Criteria

- [x] `robos-notify` sends categorized, tiered notifications via IPC to Toast Daemon
- [x] `robos-notify --category` and `--tier` flags work with all valid values
- [x] `robos-notify --json` reads notification from stdin
- [x] `robos-active-task` get/set/clear works and persists to `~/.config/robos/active-issue`
- [x] `robos-journal-append` writes entries to journal event file and Git daily logs
- [x] `robos-event emit` publishes events to the Event Bus and log
- [x] `robos-event listen` streams events with optional type/category filter
- [x] `robos-event history` queries persisted event log files
- [x] All CLIs print help with `--help` flag
- [x] Verified with unit tests (`unit.test.js`), automated E2E tests (`e2e.test.js`), and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-cli/`.
