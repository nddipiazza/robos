---
nav_exclude: true
---

# Story 11-03: RobOS Update Mechanism

**Epic:** [Release & Packaging](epic.md)
**Status:** Not started
**Points:** 8

## Description

Pull new app versions without rebuilding the VM. RobOS checks a release repo for updates. Downloads changed packages, runs npm install, updates .desktop files. Supports: auto-update (background check + notify), manual update (button in Preferences), rollback to previous version. Version pinning per-app.

## Acceptance Criteria

- [ ] Automated and repeatable (no manual steps)
- [ ] Documented in CLAUDE.md
- [ ] Tested in CI
