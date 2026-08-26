---
nav_exclude: true
---

# Story 27-03: RobOS Project Graph Studio App (`packages/project-graph`)

**Epic:** [Contract-Driven Project Knowledge Graph & Autonomous Deployment Engine](epic.md)
**Status:** Not started
**Points:** 8

## Description

Build `packages/project-graph`, an Electron visual desktop application for exploring, editing, validating, and dispatching tasks from a project's Knowledge Graph. Features an interactive 2D node canvas with status color-coding (`TODO`, `UNBLOCKED`, `IN_PROGRESS`, `VERIFIED`, `BLOCKED`), contract inspector/editor, and direct "Dispatch RobOS Agent" trigger.

## Acceptance Criteria

- [ ] Electron app renders interactive 2D graph view of features, tasks, contracts, and code bindings.
- [ ] Allows editing task contracts, acceptance criteria, and verification commands directly in UI.
- [ ] Displays live graph metrics (completion %, blocked DAG bottlenecks).
- [ ] Provides one-click "Dispatch Agent" button on unblocked task nodes.
