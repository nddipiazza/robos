---
nav_exclude: true
---

# Story: Sub-Agent Linux Daemon (robos-agentd)

**Epic:** [RobOS Desktop Agents](epic.md)  
**Status:** Done  
**Points:** 8  

## Description

Build `robos-agentd`, a background system daemon for managing ephemeral or persistent Linux sub-agent user accounts (`agent-<task-id>`). Handles user creation via PAM / sudoers policy, home directory initialization (`/home/agent-<task-id>`), group permissions, resource limits (cgroups), and cleanup upon task completion.

## Acceptance Criteria

- [x] `robos-agentd` spawns an isolated Linux user `agent-<task-id>` without requiring manual root password prompt
- [x] User directory `/home/agent-<task-id>` is provisioned with standard shell environment and RobOS dev harness dependencies
- [x] Account cleanup safely archives logs and removes ephemeral user accounts upon termination
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-agentd/agentd.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-agentd/`.
