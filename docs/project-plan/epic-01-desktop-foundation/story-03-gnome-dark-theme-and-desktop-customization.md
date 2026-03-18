# Story 01-03: GNOME Dark Theme and Desktop Customization

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 3

## Description

Configure system-wide dconf settings: Yaru-dark theme, prefer-dark color scheme, solid #0d1117 background, Ubuntu fonts, 12h AM/PM clock with weekday, minimize/maximize/close buttons. Apply via /etc/dconf/db/local.d/ with locks to prevent GNOME first-login from overriding.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh --firstboot → reboot)
- [ ] Settings persist across reboots
