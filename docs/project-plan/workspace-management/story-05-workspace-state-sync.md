---
nav_exclude: true
---

# Story 05-05: Workspace State Sync

**Epic:** [Workspace Management](epic.md)
**Status:** Not started
**Points:** 3

## Description

Workspace state (branch, open files, running services, workflow stage) is saved to RobOS distributed config. When resuming a task on a different machine, the workspace is restored to the exact state. Sync on: stage transitions, manual save, periodic auto-save.

## Acceptance Criteria

- [ ] Tested with buildbarn-forms example project
- [ ] Works with both JetBrains IDEs and VS Code
- [ ] Errors handled gracefully with user-visible messages
