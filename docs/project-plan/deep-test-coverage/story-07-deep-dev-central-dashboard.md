---
nav_exclude: true
---

# Story 20-07: Deep E2E Tests for dev-central and manager-dashboard

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 3
**Dependencies:** Stories 01, 02, 03

## Description

Deep interaction tests for the developer and manager dashboards. Depends on Story 03 (port conflict fixes).

### dev-central Tests

1. **My Tasks** — Verify section populates with testuser-assigned issues from stub.
2. **My PRs** — Verify testuser-authored PRs appear.
3. **Review Requests** — Verify review-requested PRs appear.

### manager-dashboard Tests

4. **KPI cards** — Verify "Open Issues" and "PRs Merged" show non-zero counts.
5. **Tasks by stage** — Verify sprint/stage breakdown renders.
6. **Time range selector** — Click between time ranges, verify data updates.

## Acceptance Criteria

- [ ] dev-central: My Tasks, My PRs, Review Requests populate from stub data
- [ ] manager-dashboard: KPI cards show non-zero counts
- [ ] manager-dashboard: Sprint/velocity sections render
- [ ] All tests pass in headless mode
