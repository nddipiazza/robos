---
nav_exclude: true
---

# Story 01-02: Cloud-Init Provisioning with ASCII Splash

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 5

## Description

Create cloud-init user-data with: user creation (robos/robos), SSH key injection, package installation, and a shell-based ASCII splash screen that shows step-by-step progress on tty1 during provisioning. Splash uses RobOS branded ASCII art with green checkmarks for completed steps.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh → reboot)
- [ ] Settings persist across reboots
