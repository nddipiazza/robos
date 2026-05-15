---
nav_exclude: true
---

# Story 01-06: GDM Auto-Login and Display Configuration

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 2

## Description

Configure GDM3: automatic login for robos user, disable Wayland (X11 only), graphical.target as default. Disable GNOME initial-setup first-login wizard. Set 1920x1080 resolution via virtio-vga device.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh --firstboot → reboot)
- [ ] Settings persist across reboots
