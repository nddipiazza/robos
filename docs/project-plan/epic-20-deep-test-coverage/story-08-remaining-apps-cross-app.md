# Story 20-08: Deep E2E Tests for Remaining Apps and Cross-App Verification

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 3
**Dependencies:** Story 02

## Description

Interaction tests for apps that don't use `gh` stubs (filesystem/IPC only), plus cross-app verification.

### App Tests

1. **workspace-manager** — Click Scan button, verify scan completes. Test filter controls.
2. **automation-studio** — Click New Rule, verify form. Test tab switching.
3. **notifications** — Verify category and tier filter toggles.
4. **context-manager** — Verify source area renders.
5. **agents-manager** — Verify provider detection section.

### Cross-App Test

6. **Shared config** — Launch task-board with `github-task-server`, verify issues load. Kill. Launch issue-manager with `issue-manager-github` (same repo). Verify same repo's issues load. Confirms shared settings.json works.

## Acceptance Criteria

- [ ] workspace-manager: Scan button triggers scan, result displayed
- [ ] automation-studio: New Rule button works, tabs switch content
- [ ] notifications: Category and tier filters toggle
- [ ] Cross-app: task-board and issue-manager both load data for same repo
- [ ] All tests pass in headless mode
