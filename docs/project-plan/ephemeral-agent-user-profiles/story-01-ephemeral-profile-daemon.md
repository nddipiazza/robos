---
nav_exclude: true
---

# Story: Ephemeral Profile Daemon & PAM Helper (robos-profiled)

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 8  

## Description

Implement `robos-profiled`, a system daemon and privileged helper that manages the lifecycle of dynamic Linux user accounts (`my-agent-<name>`). Handles non-interactive user provisioning, UID allocation, transient cgroup/systemd scope creation (`systemd-run --unit=robos-agent-<name> --scope`), memory-backed tmpfs home isolation, and reliable teardown upon session exit.

Also includes the **RobOS Ephemeral Profile Control Center** application and CLI (`packages/robos-profiled`).

## Acceptance Criteria

- [x] Daemon creates Linux user account `my-agent-<unique-name>` on demand without password prompting
- [x] User is assigned to necessary subsystem groups (`video`, `render`, `audio`, `kvm`)
- [x] All processes executed within the profile run inside an isolated systemd slice/scope for clean bulk termination
- [x] Daemon exposes a local control socket for lifecycle requests (create, inspect, terminate, list)
- [x] Interactive GUI Control Center provides real-time profile metrics and one-click termination
- [x] Verified with automated E2E tests (`packages/robos-test/tests/robos-profiled/e2e.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled/`.
