---
nav_exclude: true
---

# Story 02-04: DOM Snapshot Debugging System

**Epic:** [App Framework](epic.md)
**Status:** Done
**Points:** 5

## Description

Build robos-lib/dom-snapshot.js: Playwright-style DOM snapshot system for Electron apps. Each app runs a debug HTTP server on a unique port (19100+). Endpoints: /text-snapshot (indented DOM tree), /snapshot (full JSON), /screenshot (PNG), /eval (execute JS in renderer), /health. Allows debugging apps over SSH without VNC.

## Acceptance Criteria

- [ ] registerSnapshotIPC() wires IPC handlers to BrowserWindow
- [ ] startDebugServer() starts HTTP server on specified port
- [ ] Text snapshot produces readable DOM tree
- [ ] /eval can click buttons and read state
- [ ] snapshot-cli.js provides CLI access with port registry
