---
nav_exclude: true
---

# Story 01-08: Node.js and Electron Runtime Installation

**Epic:** [Desktop Foundation](epic.md)
**Status:** Done
**Points:** 3

## Description

Install Node.js 20 via NodeSource apt repository. Install Electron 28 globally (npm install -g electron@28). Install Electron runtime dependencies: libgtk-3-0, libnss3, libxss1, libxtst6, libdrm2, libgbm1, libasound2, etc.

## Acceptance Criteria

- [ ] Implementation complete and tested in QEMU VM
- [ ] Survives full delete/rebuild cycle (build.sh → run.sh → reboot)
- [ ] Settings persist across reboots
