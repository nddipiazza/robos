# Story 03-04: JetBrains IDE Installers

**Epic:** [Dev Tools](epic.md)
**Status:** Done
**Points:** 3

## Description

Install JetBrains IDEs via snap --classic. After install, copy snap .desktop file to /usr/share/applications/ (or generate one with correct icon path /snap/<ide>/current/bin/<ide>.svg). Uninstall cleans up .desktop file. IDEs: IntelliJ, PyCharm, WebStorm, GoLand, CLion, Rider, RustRover.

## Acceptance Criteria

- [ ] Tested via DOM snapshot: install button → log streams → status changes to "Installed"
- [ ] Survives app restart (status persists via checkCmd)
