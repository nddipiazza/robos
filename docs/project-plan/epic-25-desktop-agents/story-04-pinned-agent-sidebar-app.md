---
nav_exclude: true
---

# Story 25-04: Pinned Agent Sidebar App (agent-sidebar)

**Epic:** [RobOS Desktop Agents](epic.md)
**Status:** Not started
**Points:** 5

## Description

Create `packages/agent-sidebar`, an Electron application that runs inside the agent's virtual desktop session, locked to the right-hand side of the screen (320px width). Displays live workflow progress, step execution, tool calls, and human approval triggers.

## Acceptance Criteria

- [ ] Window manager rules lock `agent-sidebar` to the right screen boundary inside agent session.
- [ ] Displays live agent plan, step-by-step progress, and tool invocation log.
- [ ] Leaves remaining screen space available for agent apps (VS Code, Chromium, terminals).
