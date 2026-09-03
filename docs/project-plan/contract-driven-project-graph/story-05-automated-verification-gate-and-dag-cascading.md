---
nav_exclude: true
---

# Story 27-05: Automated Verification Gate & DAG Cascading Engine

**Epic:** [Contract-Driven Project Knowledge Graph & Autonomous Deployment Engine](epic.md)
**Status:** Not started
**Points:** 5

## Description

Implement the automated verification gate and DAG state cascading engine. After an agent implements code for a task node, it executes the `verificationGate.command` (e.g., GUT test runner, PyTest, Jest). If tests pass, the task transitions to `VERIFIED`, updating `.robos/project-graph.json-ld` and automatically unlocking downstream tasks in the DAG.

## Acceptance Criteria

- [ ] Agent executes `verificationGate.command` upon finishing code edits.
- [ ] Task transitions to `VERIFIED` only when test exit code is 0.
- [ ] Automatically evaluates downstream dependent tasks and transitions unlocked nodes from `BLOCKED` to `UNBLOCKED`.
- [ ] Emits system toast notification and updates `Dev Central` project progress widget.
