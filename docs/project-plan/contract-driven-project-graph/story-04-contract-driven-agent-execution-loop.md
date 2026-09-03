---
nav_exclude: true
---

# Story 27-04: Contract-Driven Agent Execution Loop

**Epic:** [Contract-Driven Project Knowledge Graph & Autonomous Deployment Engine](epic.md)
**Status:** Not started
**Points:** 8

## Description

Integrate `packages/robos-graph` with `packages/desktop-agents` and `packages/robos-agent-session`. When an agent is dispatched to a task node, it receives the exact input/output contracts, signal signatures, target files, and acceptance criteria as its prompt context, preventing out-of-scope modifications.

## Acceptance Criteria

- [ ] Sub-agent receives contract specification payload upon assignment.
- [ ] Agent restricts code edits to `codeBindings` files specified in the task contract.
- [ ] Agent logs progress steps against contract acceptance criteria.
- [ ] Sub-agent session status synchronizes live with `packages/project-graph` node state.
