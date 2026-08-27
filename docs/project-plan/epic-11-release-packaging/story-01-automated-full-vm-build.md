---
nav_exclude: true
---

# Story 11-01: Automated Full VM Build

**Epic:** [Release & Packaging](epic.md)
**Status:** Not started
**Points:** 5

## Description

build.sh bundles ALL RobOS apps into the seed ISO and cloud-init installs everything on first boot. End result: run build.sh + run.sh → wait → reboot → fully configured RobOS desktop with all apps installed, all .desktop files in place, all dconf settings applied. No manual deployment needed.

## Acceptance Criteria

- [ ] Automated and repeatable (no manual steps)
- [ ] Documented in CLAUDE.md
- [ ] Tested in CI
