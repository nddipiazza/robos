---
nav_exclude: true
---

# Story 27-01: RobOS Graph Core Library & Schema Engine (`packages/robos-graph`)

**Epic:** [Contract-Driven Project Knowledge Graph & Autonomous Deployment Engine](epic.md)
**Status:** Not started
**Points:** 8

## Description

Create `packages/robos-graph`, a shared Node.js / TypeScript core library. Implements standard JSON-LD and JSON Schema definitions for `.robos/project-graph.json-ld`, DAG dependency resolution (topological sort, cycle detection), task status transition logic, and SHACL validation.

## Acceptance Criteria

- [ ] Defines standard schema for Features, Tasks, Contracts (Inputs, Outputs, Signals, Acceptance Criteria), Code Bindings, and Verification Gates.
- [ ] Provides API methods: `loadGraph()`, `saveGraph()`, `getUnblockedTasks()`, `validateGraph()`, `updateTaskStatus()`.
- [ ] Resolves DAG dependencies and throws clear errors on cyclic task dependencies.
- [ ] Validates graph nodes against SHACL and JSON Schema rules.
