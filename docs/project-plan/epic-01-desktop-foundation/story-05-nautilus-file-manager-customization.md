---
nav_exclude: true
---

# Story 01-05: Nautilus File Manager Customization

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 2

## Description

Configure Nautilus via dconf: list-view default, visible columns (name, size, type, date_modified_with_time, date_created), tree view enabled, show hidden files. Apply to both system dconf and user dconf database.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh --firstboot → reboot)
- [ ] Settings persist across reboots
