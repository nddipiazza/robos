---
nav_exclude: true
---

# Story: Display & Media Subsystem Bridging

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 8  

## Description

Implement seamless graphical display and media bridging so that applications (Chromium, VS Code, Electron apps, Tilix) launched under the ephemeral agent account render directly on the developer's primary host display (X11 / Wayland) alongside native windows. Automates X11 MIT-MAGIC-COOKIE / Xauthority generation, Wayland socket ACLs (`/run/user/<host_uid>/wayland-0`), PipeWire/PulseAudio socket sharing, and GPU direct rendering access (`/dev/dri/*`).

## Acceptance Criteria

- [x] Agent user can open X11 and Wayland GUI applications that display directly on host `$DISPLAY` / `$WAYLAND_DISPLAY`
- [x] Windows appear on the host desktop manager with full interactive focus, mouse, keyboard, and clipboard access
- [x] Sound output from agent processes plays through the host audio server (PulseAudio/PipeWire) without permission errors
- [x] Hardware acceleration (OpenGL/Vulkan) works via shared DRI render node permissions
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-profiled/display-bridge.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled-display/`.
