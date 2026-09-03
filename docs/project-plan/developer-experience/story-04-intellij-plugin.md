---
nav_exclude: true
---

# Story 14-04: IntelliJ Plugin

**Epic:** [Developer Experience & Testing](epic.md)
**Status:** Not started
**Points:** 8

## Description

Kotlin/Java IntelliJ platform plugin. IPC HTTP server on port 63343 with endpoints: /robos/health, /robos/open-project, /robos/open-file, /robos/navigate, /robos/run, /robos/stop, /robos/workspace. RobOS tool window showing active task, workflow stage, and collaborators. Run configuration injection. Notification bridge via WebSocket. Built with Gradle, targets IntelliJ 2024.1+.

## Acceptance Criteria

- [ ] Documented usage in CLAUDE.md
- [ ] Tested with at least 2 RobOS apps
