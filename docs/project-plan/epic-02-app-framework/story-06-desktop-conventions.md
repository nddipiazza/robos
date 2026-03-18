# Story 02-06: .desktop File Conventions and X-RobOS Fields

**Epic:** [App Framework](epic.md)
**Status:** Done
**Points:** 2

## Description

Establish conventions for RobOS .desktop files: X-RobOS-App=true marker, X-RobOS-Category field (Dev|AI|Security|People|Journal|System|Internet|Tools), StartupWMClass for window management, standard Exec with --no-sandbox --disable-gpu --disable-dev-shm-usage flags, Icon pointing to /usr/local/share/robos/<app-id>/icon.svg.

## Acceptance Criteria

- [ ] Convention documented in CLAUDE.md and /create-robos-app command
- [ ] App launcher discovers apps via X-RobOS-App field
- [ ] All deployed apps follow the convention
