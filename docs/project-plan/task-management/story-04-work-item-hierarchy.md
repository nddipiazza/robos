---
nav_exclude: true
---

# Story 04-04: Work Item Hierarchy (Release → Epic → Story → Bug)

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 5

## Description

Implement first-class Release, Epic, Story, and Bug work item types. Each has its own workflow (configurable via RobOS Config). Releases contain Epics, Epics contain Stories/Bugs. Track progress rollup: Epic progress = % of stories done, Release progress = % of epics done. Support custom work item types (Spike, Tech Debt, Experiment) via config.

## Acceptance Criteria

- [ ] Release, Epic, Story, Bug each have distinct default workflows
- [ ] Parent-child relationships enforced (Story must belong to an Epic)
- [ ] Progress rolls up through the hierarchy
- [ ] Custom work item types can be defined in RobOS config
- [ ] UI shows hierarchy with expand/collapse
