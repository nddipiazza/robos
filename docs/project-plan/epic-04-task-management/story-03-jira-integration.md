---
nav_exclude: true
---

# Story 04-03: Jira Integration

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 8

## Description

Implement the Jira adapter for robos-task-client. Map Jira concepts: Versions → Releases, Epics → Epics, Stories/Tasks → Stories, Bugs → Bugs. Support: JQL search, create/update/transition issues, log work, add comments. Handle Jira's complex custom field system. Support both Jira Cloud and Jira Data Center.

## Acceptance Criteria

- [ ] JQL-powered search with RobOS filter UI
- [ ] Create/update issues with all standard fields
- [ ] Transition issues through Jira workflows
- [ ] Log work hours automatically
- [ ] Handle custom fields gracefully
- [ ] Both Cloud and Data Center APIs supported
