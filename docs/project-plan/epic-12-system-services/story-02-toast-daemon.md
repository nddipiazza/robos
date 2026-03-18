# Story 12-02: Toast Daemon

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Electron app running as a keep-alive background process. Displays system-wide overlay toast notifications (top-right corner). Other apps send toasts via robos-notify CLI or IPC. Supports: info/warning/error/success types, custom icons, click actions, auto-dismiss timers. Dark theme matching RobOS design system.

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
