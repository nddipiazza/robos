---
nav_exclude: true
---

# Epic 20: Deep Test Coverage & Autonomous Verification

**Status:** Not started
**Priority:** Critical
**Dependencies:** Epic 16 (Test Framework — harness, snapshots, scenarios already built)

The test harness infrastructure is solid but test coverage is shallow — 432 unit tests cover utility functions and 90 E2E tests only verify "app launches and shows title." The `gh` CLI stub doesn't handle the commands apps actually call, and zero tests use the `/eval` endpoint to interact with UI. This epic closes those gaps so an AI agent can autonomously verify that features work.

## Why This Is Critical

Without deep tests, every feature implementation requires manual verification in the VM. An autonomous agent working epics needs to run tests after each change and confirm features work end-to-end — not just that the app boots. The `gh` stub expansion alone unblocks testing for 8 apps that depend on GitHub data.

## Architecture

```
packages/robos-test/
├── sandbox/
│   ├── bin/gh              ← Story 01: expand with issue/PR/run stubs
│   └── data/               ← Story 01: JSON response fixtures
│       ├── issues-open.json
│       ├── prs-open.json
│       ├── runs.json
│       └── ...
├── lib/
│   ├── harness.js          ← Story 03: add missing PORT_MAP entries
│   ├── snapshot.js          ← Story 02: add evalClick, evalType, evalWaitFor
│   └── scenarios.js
└── tests/
    ├── task-board/e2e.test.js     ← Story 04: deep interaction tests
    ├── issue-manager/e2e.test.js  ← Story 05: deep interaction tests
    ├── pr-review/e2e.test.js      ← Story 06: deep interaction tests
    ├── ci-monitor/e2e.test.js     ← Story 06: deep interaction tests
    ├── dev-central/e2e.test.js    ← Story 07: deep interaction tests
    └── ...
```

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Expand gh CLI stub with issue/PR/run data](story-01-gh-stub-expansion.md) | Not started | 8 |
| 02 | [Add /eval interaction helpers to snapshot.js](story-02-eval-interaction-helpers.md) | Not started | 5 |
| 03 | [Fix port conflicts and add missing harness entries](story-03-port-conflicts.md) | Not started | 3 |
| 04 | [Deep E2E tests for task-board](story-04-deep-task-board.md) | Not started | 5 |
| 05 | [Deep E2E tests for issue-manager](story-05-deep-issue-manager.md) | Not started | 5 |
| 06 | [Deep E2E tests for pr-review, ci-monitor, and stage-demo](story-06-deep-pr-ci-stage.md) | Not started | 5 |
| 07 | [Deep E2E tests for dev-central and manager-dashboard](story-07-deep-dev-central-dashboard.md) | Not started | 3 |
| 08 | [Deep E2E tests for remaining apps and cross-app verification](story-08-remaining-apps-cross-app.md) | Not started | 3 |
