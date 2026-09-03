---
nav_exclude: true
---

# Story: CLI Runner & Desktop Manager IPC Bridge

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Create convenient CLI tools and IPC endpoints for executing tasks in ephemeral user profiles. Implements `robos-run-as --agent <name> [--autoclean] <command...>` CLI binary and extends `packages/desktop-manager` and `packages/robos-lib` with IPC handlers (`agentProfile:create`, `agentProfile:run`, `agentProfile:terminate`, `agentProfile:list`). Enables apps like `Agents Manager`, `Dev Central`, and `App Launcher` to spawn processes inside ephemeral profiles.

## Acceptance Criteria

- [x] CLI tool `robos-run-as --agent worker-1 <command>` provisions the profile if not already existing, bridges environment/display, and runs the command
- [x] Passing `--autoclean` terminates and wipes the profile when the target process exits
- [x] Electron apps can invoke `window.profiled.runCommand(name, command, options)` via preload bridge
- [x] Desktop Manager broadcasts session creation/destruction events across the system IPC bus
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-profiled/cli-runner.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled-runner/`.
