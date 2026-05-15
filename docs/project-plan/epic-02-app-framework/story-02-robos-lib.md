---
nav_exclude: true
---

# Story 02-02: robos-lib Shared Utilities

**Epic:** [App Framework](epic.md)
**Status:** Done
**Points:** 3

## Description

Create packages/robos-lib/ with: canonical RobOS category registry (Dev, AI, Security, People, Journal, System, Internet, Tools), .desktop file parser supporting X-RobOS-App and X-RobOS-Category fields, displayName() helper that strips "RobOS " prefix, loadRobOSApps() scanner, groupByCategory() organizer.

## Acceptance Criteria

- [ ] Category registry with order and labels
- [ ] .desktop parser handles all standard and X-RobOS fields
- [ ] displayName() strips prefix correctly
- [ ] loadRobOSApps() finds all X-RobOS-App=true entries
