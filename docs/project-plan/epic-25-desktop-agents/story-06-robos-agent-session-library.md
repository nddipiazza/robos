---
nav_exclude: true
---

# Story 25-06: Agent Session Shared Library (robos-agent-session)

**Epic:** [RobOS Desktop Agents](epic.md)
**Status:** Not started
**Points:** 5

## Description

Create `packages/robos-agent-session`, a shared JavaScript library that exposes IPC and daemon bindings for launching, monitoring, and terminating desktop agent sessions from any RobOS app (`Dev Central`, `Issue Manager`, `Workflow Studio`).

## Acceptance Criteria

- [ ] Exposes clean API: `spawnAgentSession()`, `listAgentSessions()`, `sendAgentCommand()`, `terminateAgentSession()`.
- [ ] Integrates with `Dev Central` and `Issue Manager` task cards to trigger agent desktop sessions.
- [ ] Emits real-time state change events over IPC.
