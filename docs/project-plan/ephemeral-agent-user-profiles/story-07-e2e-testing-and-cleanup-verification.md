---
nav_exclude: true
---

# Story: Automated E2E Test Harness & Zero-Residue Cleanup Verification

**Epic:** [Ephemeral Agent User Profiles with Direct Host Display Bridging](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Develop comprehensive automated tests using the `robos-test` framework and Docker/Xvfb container environment (`./scripts/e2e-container.sh`). Validates multi-account concurrency (running 4+ agents concurrently), GUI rendering on virtual display, socket permission isolation, and zero-residue cleanup verification (checking `/home`, `mount`, `/etc/passwd`, and active cgroups after test completion).

## Acceptance Criteria

- [x] Automated test runs 4 concurrent agent profiles simultaneously executing CLI and GUI tasks
- [x] Validates that GUI windows are created and captureable via DOM snapshot or X11 tree
- [x] Confirms no permission leakage or unauthorized file access between agent profiles and host profile (enforcing `0700` POSIX boundaries)
- [x] Asserts zero disk residue, unmounted tmpfs paths, and cleaned user accounts post-execution
- [x] Integrates into the RobOS continuous integration suite and verified with persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-profiled-zero-residue/`.
