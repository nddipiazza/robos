# Story 20-05: Deep E2E Tests for issue-manager

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 5
**Dependencies:** Stories 01, 02

## Description

Deep interaction tests for issue-manager covering issue list, issue detail, and workflow transitions.

### Tests

1. **Issue list loads** — Launch with `issue-manager-github`. Wait for issue titles from stub to appear.

2. **Issue detail panel** — Click an issue. Verify detail shows title, body, labels, assignees, comments (stub returns issue #42 with 2 comments).

3. **Workflow transition** — The scenario configures a bug workflow (Triage -> In Progress -> Done). Click transition button. Verify UI updates label display.

4. **Config view** — Launch with `issue-manager-no-config`. Verify config/setup view renders instead of issue list.

## Acceptance Criteria

- [ ] Test verifies issue list shows titles from stub data
- [ ] Test opens issue detail and verifies title, body, labels, comments
- [ ] Test performs workflow transition and verifies UI updates
- [ ] Test verifies config view renders when no server configured
- [ ] All tests pass in headless mode
