---
nav_exclude: true
---

# Story 03-02: Real-Time Streaming Install Logs

**Epic:** [Dev Tools](epic.md)
**Status:** Done
**Points:** 3

## Description

Install log panel shows output in real-time as commands run. Start with 'Downloading and installing {Name} from {source}...' immediately on click. Stream stdout/stderr to renderer via IPC install-progress events. Show success/failure on completion.

## Acceptance Criteria

- [ ] Tested via DOM snapshot: install button → log streams → status changes to "Installed"
- [ ] Survives app restart (status persists via checkCmd)
