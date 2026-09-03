---
nav_exclude: true
---

# Story 16-04: Dev Tools Smoke Tests (Install/Uninstall Flow)

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 3

## Description

Smoke tests for the Dev Tools app, including the full install/uninstall flow.

### Tests

1. **Launch and render** — App opens with tool list and category bar
2. **Category filtering** — Click "CLI" → only CLI tools shown, click "All" → all shown
3. **Tool status detection** — At least one tool shows "Installed" (htop, jq, etc.)
4. **Install flow** — Click Install on a small tool (jq) → log panel opens with "Downloading and installing jq from apt..." → status changes to "Installed"
5. **Uninstall flow** — Click Uninstall on the same tool → status changes back to "Not installed"
6. **Log panel** — View Log button shows install output
7. **Tool count** — Total tool count matches expected (19+)

## Acceptance Criteria

- [ ] Full install/uninstall cycle tested
- [ ] Log panel content verified
- [ ] Tests complete in under 60 seconds (install is real, takes time)
