---
nav_exclude: true
---

# Story 01-07: SPICE Clipboard Sharing

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 2

## Description

Install spice-vdagent in VM. Configure QEMU with virtio-serial-pci and SPICE vdagent channel. Enable SPICE protocol on GTK display mode for bidirectional clipboard between host and VM. Hide QEMU menu bar.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh → reboot)
- [ ] Settings persist across reboots
