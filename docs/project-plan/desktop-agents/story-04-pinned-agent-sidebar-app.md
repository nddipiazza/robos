---
nav_exclude: true
---

# Story: Pinned Agent Sidebar App (agent-sidebar)

**Epic:** [RobOS Desktop Agents](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Create `packages/agent-sidebar`, an Electron application that runs inside the agent's virtual desktop session, locked to the right-hand side of the screen (320px width). Displays live workflow progress, step execution, tool calls, and human approval triggers.

## Acceptance Criteria

- [x] Window manager rules lock `agent-sidebar` to the right screen boundary inside agent session (320px width, 1080px height)
- [x] Displays live agent plan, step-by-step progress, and tool invocation log
- [x] Leaves remaining screen space available for agent apps (VS Code, Chromium, terminals)
- [x] Verified with automated E2E tests (`packages/robos-test/tests/desktop-agents/agent-sidebar.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/agent-sidebar/`.
