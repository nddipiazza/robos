# Story 12-03: Notifications App

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 3

## Description

Notification history viewer. Shows all past notifications in reverse chronological order with: timestamp, source app, type, message. Filter by app, type, date range. Mark as read/unread. Clear all. Reads from ~/.config/robos/notifications.json (written by Toast Daemon and robos-notify CLI).

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
