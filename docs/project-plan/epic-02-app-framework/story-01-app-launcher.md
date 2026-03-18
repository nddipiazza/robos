# Story 02-01: App Launcher with Search and Categories

**Epic:** [App Framework](epic.md)
**Status:** Done
**Points:** 5

## Description

Build a frameless Electron app that scans .desktop files from /usr/share/applications/, displays them in a searchable grid with category filtering (All, Utilities, System, Internet, Development, etc.), and launches apps on click. Closes on Escape or blur. Strips "RobOS " prefix from display names.

## Acceptance Criteria

- [ ] Scans .desktop files and resolves icons from Yaru/hicolor theme paths
- [ ] Search filters by name, comment, and categories
- [ ] Category pill buttons filter the grid
- [ ] Click launches app detached, then closes launcher
- [ ] Escape and blur close the window
- [ ] "RobOS " prefix stripped from display names
