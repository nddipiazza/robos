---
nav_exclude: true
---

# Story 04-07: Automatic Status/Hours/Comment Sync

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 5

## Description

As tasks progress through the RobOS workflow, automatically sync state back to the task server. Status transitions map to Jira/GitHub status changes. Hours are logged based on time-in-stage. Comments are added at key milestones: "AI draft completed", "PR #123 created", "CI passed", "Deployed to staging". Sync is bidirectional — external changes update RobOS.

## Acceptance Criteria

- [ ] Stage transitions update task server status
- [ ] Hours logged automatically (configurable: per-stage or manual)
- [ ] Comments added at workflow milestones
- [ ] External changes (someone updates in Jira) reflected in RobOS
- [ ] Conflict resolution: last-write-wins with notification
