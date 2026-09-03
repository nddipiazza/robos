---
nav_exclude: true
---

# Story: Tmpfs & Memory-Backed Home Directory Manager

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Build the storage management layer for ephemeral profiles. Mounts `/home/my-agent-<name>` on RAM-backed `tmpfs` (or lightweight sandbox directory structure) with configurable quota limits (e.g. 2GB–4GB). Ensures zero residual disk usage when the session is closed, unmounted, and purged.

## Acceptance Criteria

- [x] Ephemeral home directory `/home/my-agent-<name>` is mounted in memory via `tmpfs` with appropriate permissions (`0700`, owned by agent UID/GID)
- [x] Skeleton dotfiles (`.bashrc`, `.profile`, default shell config) are populated automatically from `/etc/skel`
- [x] Safe unmount and directory removal occurs on session teardown with no orphaned mount points or leaked disk sectors
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/robos-profiled/tmpfs.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled-tmpfs/`.
