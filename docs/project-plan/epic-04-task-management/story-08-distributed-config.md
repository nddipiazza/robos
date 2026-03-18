# Story 04-08: RobOS Distributed Config Store (Git-Backed)

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 8

## Description

Build robos-store shared library: a git-backed, versioned, distributed configuration store. Default implementation uses a GitHub repo. Stores: task server connections, workflow definitions, EKGraph schema, AI preferences, team settings. Interface supports swapping backends. Config syncs across team members via git pull/push. RobOS Config Manager app provides browse/edit/diff/history UI.

## Acceptance Criteria

- [ ] robos-store library with get/set/list/history/sync operations
- [ ] Git backend: clone, commit, push, pull, conflict detection
- [ ] Config Manager app: browse tree, edit values, view diff, version history
- [ ] Team sync: pull team configs, push local changes
- [ ] Schema validation for known config types (workflows, task servers)
