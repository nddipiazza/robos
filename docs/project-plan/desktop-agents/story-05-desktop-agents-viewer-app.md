---
nav_exclude: true
---

# Story: Desktop Agents Viewer App (desktop-agents)

**Epic:** [RobOS Desktop Agents](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Build `packages/desktop-agents`, an Electron viewer application for the host desktop that allows developers to monitor, switch between, and interactively control live agent desktop streams.

## Acceptance Criteria

- [x] Displays grid and tabbed views of all active sub-agent sessions
- [x] Renders live 60fps desktop video stream with audio/input toggle
- [x] Allows host developer to take manual keyboard/mouse control when requested
- [x] Verified with automated E2E tests (`packages/robos-test/tests/desktop-agents/desktop-agents.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/desktop-agents/`.
