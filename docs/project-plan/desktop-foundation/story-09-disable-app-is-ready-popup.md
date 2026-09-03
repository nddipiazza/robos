---
nav_exclude: true
---

# Story 01-09: Disable "App is Ready" Notification Popup

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 3

## Description

Disable GNOME Shell's built-in top-right `"App is ready"` notification popup when unfocused windows demand attention or trigger urgency hints. Overrides `WindowAttentionHandler._onDemandsAttention` within GNOME Shell / `dash-to-panel` during provisioning to prevent message tray banner popups.

## Acceptance Criteria

- [x] Implementation complete in `infra/desktop/robos-provision.sh` and `infra/desktop/cloud-init/user-data`
- [x] Survives full VM rebuild cycle
- [x] Unfocused applications demanding attention do not spawn top-right GNOME notification banners
