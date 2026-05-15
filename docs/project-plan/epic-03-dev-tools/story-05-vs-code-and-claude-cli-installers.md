---
nav_exclude: true
---

# Story 03-05: VS Code and Claude CLI Installers

**Epic:** [Dev Tools](epic.md)
**Status:** Done
**Points:** 2

## Description

VS Code: download .deb from code.visualstudio.com, dpkg install. Claude CLI: sudo npm install -g @anthropic-ai/claude-code. Both create .desktop files for app launcher discovery.

## Acceptance Criteria

- [ ] Tested via DOM snapshot: install button → log streams → status changes to "Installed"
- [ ] Survives app restart (status persists via checkCmd)
