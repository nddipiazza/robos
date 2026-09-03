---
nav_exclude: true
---

# Story: Agent Session Shared Library (robos-agent-session)

**Epic:** [RobOS Desktop Agents](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Create `packages/robos-agent-session`, a shared JavaScript library that exposes IPC and daemon bindings for launching, monitoring, and terminating desktop agent sessions from any RobOS app (`Dev Central`, `Issue Manager`, `Workflow Studio`).

## Acceptance Criteria

- [x] Exposes clean API: `spawnAgentSession()`, `listAgentSessions()`, `sendAgentCommand()`, `terminateAgentSession()`
- [x] Integrates with `Dev Central` and `Issue Manager` task cards to trigger agent desktop sessions
- [x] Emits real-time state change events over IPC
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/desktop-agents/agent-session-lib.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-agent-session/`.
