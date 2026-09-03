---
nav_exclude: true
---

# Story 04-01: Task Server Connection Manager

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 5

## Description

Build the Task Servers app (or integrate into Task Manager). Configure connections to external task tracking systems: GitHub Issues, Jira, Linear. Store credentials securely in ~/.config/robos/task-servers.json (encrypted). Support OAuth and API token auth. Test connection on save. Multiple servers can be configured simultaneously.

## Acceptance Criteria

- [ ] Add/edit/delete task server connections
- [ ] Support GitHub (OAuth + PAT), Jira (API token + OAuth), Linear (API key)
- [ ] Test connection button validates credentials
- [ ] Credentials stored encrypted in ~/.config/robos/
- [ ] robos-task-client shared library abstracts server differences
