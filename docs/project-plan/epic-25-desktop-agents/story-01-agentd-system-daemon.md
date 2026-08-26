---
nav_exclude: true
---

# Story 25-01: Sub-Agent Linux Daemon (robos-agentd)

**Epic:** [RobOS Desktop Agents](epic.md)
**Status:** Not started
**Points:** 8

## Description

Build `robos-agentd`, a background system daemon for managing ephemeral or persistent Linux sub-agent user accounts (`agent-<task-id>`). Handles user creation via PAM / sudoers policy, home directory initialization (`/home/agent-<task-id>`), group permissions, resource limits (cgroups), and cleanup upon task completion.

## Acceptance Criteria

- [ ] `robos-agentd` spawns a isolated Linux user `agent-<task-id>` without requiring manual root password prompt.
- [ ] User directory `/home/agent-<task-id>` is provisioned with standard shell environment and RobOS dev harness dependencies.
- [ ] Account cleanup safely archives logs and removes ephemeral user accounts upon termination.
