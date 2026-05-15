---
nav_exclude: true
---

# Story 12-01: Desktop Manager — System Tray and IPC Hub

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 8

## Description

Central process that runs in the system tray. Manages app lifecycle: launch, kill, restart keep-alive apps. Unix socket IPC at /run/user/{uid}/robos-dm.sock for inter-app communication. APP_REGISTRY defines all known apps with categories and keep-alive flags. Provides: app health checks, process monitoring, graceful shutdown coordination.

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
