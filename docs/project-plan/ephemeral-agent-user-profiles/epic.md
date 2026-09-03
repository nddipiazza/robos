---
nav_exclude: true
---

# Ephemeral Agent User Profiles with Direct Host Display Bridging

**Status:** Done  
**Priority:** High  
**Dependencies:** Desktop Foundation, App Framework, AI Agent Integration, System Services, Security & Auth  

Allows the host desktop to create dynamic, temporary Linux user profiles (`/home/my-agent-{unique-name}`) that exist only for the duration of an agent task or session. While `$HOME` is completely isolated in memory (`tmpfs`), all graphical apps render directly on the developer's primary host display (X11 / Wayland) alongside native windows, with transparent tunneling of host audio, network, GPU acceleration, SSH agent, Git identity, and API tokens. Includes taskbar dock / toolbar widgets for monitoring running agent accounts and one-click termination.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Ephemeral Profile Daemon & PAM Helper (robos-profiled)](story-01-ephemeral-profile-daemon.md) | **Done** | 8 |
| 02 | [Tmpfs & Memory-Backed Home Directory Manager](story-02-tmpfs-home-directory-manager.md) | **Done** | 5 |
| 03 | [Display & Media Subsystem Bridging](story-03-display-and-media-subsystem-bridging.md) | **Done** | 8 |
| 04 | [Host Identity, Credential & Socket Forwarding](story-04-host-credential-and-socket-forwarding.md) | **Done** | 5 |
| 05 | [Taskbar Dock & Toolbar Agent Management Widget](story-05-taskbar-toolbar-agent-widget.md) | **Done** | 8 |
| 06 | [CLI Runner & Desktop Manager IPC Bridge](story-06-cli-runner-and-ipc-bridge.md) | **Done** | 5 |
| 07 | [Automated E2E Test Harness & Zero-Residue Cleanup Verification](story-07-e2e-testing-and-cleanup-verification.md) | **Done** | 5 |
