---
nav_exclude: true
---

# Story 20-03: Fix Port Conflicts and Add Missing Harness Entries

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 3

## Description

Three apps have debug server port conflicts, and four apps are missing from the test harness PORT_MAP and package.json test scripts.

### Port Conflicts

| Port | App 1 (keep) | App 2 (reassign) |
|------|--------------|-------------------|
| 19129 | pr-review | dev-central → 19133 |
| 19130 | ci-monitor | manager-dashboard → 19134 |
| 19131 | stage-demo | report-builder → 19135 |

### Missing from Harness

| App | New Port |
|-----|----------|
| dev-central | 19133 |
| manager-dashboard | 19134 |
| report-builder | 19135 |
| deploy-tracker | 19132 |

### Files to Update

- `packages/dev-central/main.js` — change debug port to 19133
- `packages/manager-dashboard/main.js` — change debug port to 19134
- `packages/report-builder/main.js` — change debug port to 19135
- `packages/deploy-tracker/main.js` — add debug port 19132
- `packages/robos-test/lib/harness.js` — add 4 apps to PORT_MAP
- `packages/robos-test/package.json` — add E2E test entries

## Acceptance Criteria

- [ ] No port conflicts between any two apps
- [ ] dev-central, manager-dashboard, report-builder, deploy-tracker in PORT_MAP
- [ ] All app E2E tests listed in package.json test scripts
- [ ] All existing tests still pass
