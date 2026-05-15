---
nav_exclude: true
---

# Story 09-04: Microphone Indicator and Push-to-Talk

**Epic:** [Voice & Input](epic.md)
**Status:** Not started
**Points:** 3

## Description

System tray indicator showing when mic is active. Global push-to-talk hotkey (configurable, default: F13 or a dedicated key). Visual feedback in the focused text area: pulsing border when recording, text appearing as recognized. Cancel recording with Escape.

## Acceptance Criteria

- [ ] Works offline (no network required)
- [ ] Latency under 500ms for word recognition
- [ ] Tested in QEMU VM with virtual audio
