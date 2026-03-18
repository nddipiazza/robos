# Story 12-06: robos-cli Tools

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 3

## Description

Three CLI utilities installed to /usr/local/bin/: (1) robos-notify — send toast notifications from terminal/scripts, (2) robos-active-task — get/set the currently active task for the session, (3) robos-journal-append — write journal entries from CLI/cron. Used by agent scheduler, CI scripts, and other automation.

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
