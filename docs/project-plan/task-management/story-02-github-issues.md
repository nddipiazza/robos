---
nav_exclude: true
---

# Story 04-02: GitHub Issues Integration

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 5

## Description

Implement the GitHub Issues adapter for robos-task-client. Map GitHub concepts to RobOS work items: Milestones → Releases, Labels → Epics (via convention), Issues → Stories/Bugs, Projects → Board views. Support: list/create/update issues, manage labels, comment, assign, close. Use GitHub REST/GraphQL API via Octokit.

## Acceptance Criteria

- [ ] List issues with filtering (assignee, label, milestone, state)
- [ ] Create/update issues with labels, assignees, milestones
- [ ] Map GitHub milestones to RobOS Releases
- [ ] Bidirectional sync: changes in RobOS update GitHub and vice versa
- [ ] Pagination for large repos
