---
title: "Agent Sidebar"
package: agent-sidebar
category: ai-agents
summary: "A prototype 320-pixel sidebar that mocks up an agent's plan, tool feed and approve/refine buttons."
description: "Agent Sidebar is a UI prototype pinned to the right edge of the screen. Its plan steps and tool feed are hardcoded sample data, not a live view of a running agent."
---

Agent Sidebar is a frameless, always-on-top window, 320 pixels wide and full screen height, placed on the right edge of the primary display. It is a mock-up of how a human could follow and approve an agent's work.

{: .note }
The steps and tool log are constants in `renderer/app.js`. The sidebar does not connect to an agent, a task server or the other RobOS apps yet.

## What is on screen

- Header: agent role, agent id and a status pill (`RUNNING`). The role comes from the `ROBOS_AGENT_ROLE` environment variable (default "Senior Code Reviewer"), the task id from `ROBOS_TASK_ID` (default `TASK-101`), and the id from `USER`.
- **Workflow Execution Plan**: four fixed steps, from checking out a branch to submitting a proof-of-work artifact.
- **Live Tool Invocation Feed**: three fixed sample tool calls.
- **Human-in-the-Loop Verification** bar with two buttons. **Approve Step** marks step 3 complete and step 4 active, appends a sample entry to the feed and changes the pill to `VERIFIED`. **Refine** appends a canned "rerun coverage check" entry.

Nothing is saved or sent anywhere.

## Running it

```bash
electron packages/agent-sidebar
```

The window has no frame, so close it from the window manager or the task bar. Source: [`packages/agent-sidebar`](https://github.com/nddipiazza/robos/tree/main/packages/agent-sidebar).
