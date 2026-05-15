---
nav_exclude: true
---

# Story 01-04: Dash-to-Panel Taskbar Configuration

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 5

## Description

Install dash-to-panel v56 from extensions.gnome.org. Configure: bottom position, 32px height, hide Activities button, hide overview on startup, dark transparent panel (#0d1117 at 0.9 opacity). Apply null-guard patches for panel._leftBox. Disable ubuntu-dock extension.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh --firstboot → reboot)
- [ ] Settings persist across reboots
