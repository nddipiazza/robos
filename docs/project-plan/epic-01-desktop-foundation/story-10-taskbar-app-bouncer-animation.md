---
nav_exclude: true
---

# Story 01-10: Taskbar App Bouncer Animation

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 3

## Description

Implement a continuous bouncing animation for taskbar app icons when windows demand attention or trigger urgency flags (such as Electron `win.flashFrame(true)` or `app.dock.bounce()`). Keyframe bounce animation is added to `dash-to-panel`'s `stylesheet.css` targeting `.urgent` and `.demands-attention` elements.

## Acceptance Criteria

- [x] Implementation complete in `infra/desktop/robos-provision.sh` and `infra/desktop/cloud-init/user-data`
- [x] Taskbar icons bounce smoothly up and down when windows request attention
- [x] Bouncing continues until the app window receives user focus
