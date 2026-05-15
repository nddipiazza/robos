---
nav_exclude: true
---

# Story 08-05: EKGraph Node Linking

**Epic:** [EKGraph](epic.md)
**Status:** Not started
**Points:** 3

## Description

Link EKGraph nodes to: tasks (this bug relates to this service), repos (this service lives in this repo), people (this person owns this service). Links are bidirectional. Task Manager shows relevant EKGraph context for each task. AI agents use linked nodes for context.

## Acceptance Criteria

- [ ] Schema covers the buildbarn-forms project's engineering context
- [ ] Data survives sync/restore cycle
- [ ] Other apps can query via robos-ekgraph API
