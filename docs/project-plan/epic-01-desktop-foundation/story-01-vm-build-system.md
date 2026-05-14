# Story 01-01: VM Build System

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 3

## Description

Create build.sh that downloads Ubuntu 24.04 cloud image, creates 200G sparse qcow2 disk, and generates cloud-init seed ISO. Create run.sh with GTK/VNC/SPICE/headless display modes, KVM acceleration, and SSH port forwarding (localhost:2224).

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh --firstboot → reboot)
- [ ] Settings persist across reboots
