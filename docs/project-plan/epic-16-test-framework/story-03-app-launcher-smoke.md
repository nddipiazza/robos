---
nav_exclude: true
---

# Story 16-03: App Launcher Smoke Tests

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 3

## Description

Smoke tests for the App Launcher, serving as the reference test suite.

### Tests

1. **Launch and render** — App opens, shows search bar and app grid
2. **Apps loaded** — Grid has >5 app cards
3. **Search filtering** — Type "terminal" → only matching apps shown
4. **Clear search** — Clear input → all apps return
5. **Category tabs** — Click a category → grid filters, click "All" → restores
6. **RobOS prefix stripped** — No app card shows "RobOS " prefix
7. **App launch** — Click an app card → app process starts (verify via ps)
8. **Escape closes** — Press Escape → launcher window closes

## Acceptance Criteria

- [ ] All 8 tests pass against a running VM
- [ ] Tests complete in under 30 seconds total
- [ ] Screenshot captured on any failure
