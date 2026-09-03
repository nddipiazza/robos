---
nav_exclude: true
---

# Story 05-03: IDE Bridge (Open, Navigate, Breakpoints)

**Epic:** [Workspace Management](epic.md)
**Status:** Not started
**Points:** 8

## Description

IPC HTTP bridge to JetBrains IDEs (port 63343) and VS Code (code --goto). Capabilities: open project, open file at line, set breakpoints, inject run configurations (.idea/runConfigurations/ XML), start/stop debug sessions. Used by AI agents to set up reproduction environments and by Workspace Manager to open workspaces.

## Acceptance Criteria

- [ ] Tested with buildbarn-forms example project
- [ ] Works with both JetBrains IDEs and VS Code
- [ ] Errors handled gracefully with user-visible messages
