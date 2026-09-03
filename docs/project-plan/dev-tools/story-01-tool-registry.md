---
nav_exclude: true
---

# Story 03-01: Tool Registry

**Epic:** [Dev Tools](epic.md)
**Status:** Done
**Points:** 3

## Description

Create tool registry in main.js with id, name, description, category, source, checkCmd, installCmd, uninstallCmd for each tool. checkCmd detects if installed. installCmd/uninstallCmd run via bash spawn. 19 tools across 4 categories.

## Acceptance Criteria

- [ ] Tested via DOM snapshot: install button → log streams → status changes to "Installed"
- [ ] Survives app restart (status persists via checkCmd)
