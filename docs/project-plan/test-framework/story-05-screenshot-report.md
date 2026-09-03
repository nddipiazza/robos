---
nav_exclude: true
---

# Story 16-05: Screenshot-on-Failure and HTML Test Report

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 3

## Description

When a test fails, automatically capture a screenshot and the DOM snapshot. Generate an HTML report after the test run with pass/fail results, failure details, and embedded screenshots.

### Report Format

```
test-results/
├── report.html           (open in browser)
├── screenshots/
│   ├── app-launcher-search-FAIL.png
│   └── dev-tools-install-PASS.png
└── snapshots/
    ├── app-launcher-search-FAIL.txt
    └── dev-tools-install-PASS.txt
```

### HTML Report

- Summary: X passed, Y failed, Z skipped, total duration
- Per-test: name, status, duration, failure message
- Embedded screenshots (click to expand)
- DOM snapshot diff on failure (expected vs actual)
- Filterable by status (show only failures)

## Acceptance Criteria

- [ ] Screenshots captured on every failure automatically
- [ ] HTML report generated after each run
- [ ] Report viewable in any browser
- [ ] Failed test details include DOM snapshot and screenshot
