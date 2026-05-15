---
nav_exclude: true
---

# Story 20-06: Deep E2E Tests for pr-review, ci-monitor, and stage-demo

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 5
**Dependencies:** Stories 01, 02

## Description

Deep interaction tests for the three code-review and CI apps.

### pr-review Tests

1. **PRs render** — Launch with `pr-review-github`. Verify 3 PRs appear with titles from stub.
2. **PR detail** — Click a PR. Verify changed files (4 files), checks (3 checks), review comments.
3. **CI status badges** — Verify PRs show correct status indicators (success, failure, pending).

### ci-monitor Tests

4. **Runs render** — Launch with `ci-monitor-github`. Verify 4 workflow runs with correct statuses.
5. **Run detail** — Click a run. Verify jobs list and failed log excerpt.
6. **Stats bar** — Verify pass/fail counts match stub data.

### stage-demo Tests

7. **New Demo flow** — Launch with `stage-demo-github`. Click New Demo. Verify merged PRs list.

## Acceptance Criteria

- [ ] pr-review: PRs render with correct titles, authors, CI status badges
- [ ] pr-review: PR detail shows changed files, checks, and comments
- [ ] ci-monitor: Workflow runs render with correct status badges
- [ ] ci-monitor: Run detail shows jobs and failed log
- [ ] stage-demo: New demo flow works with stub data
- [ ] All tests pass in headless mode
