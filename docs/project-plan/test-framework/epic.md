---
nav_exclude: true
---

# RobOS App Test Framework

**Status:** Not started
**Priority:** Critical
**Dependencies:** App Framework — DOM snapshot system already built

E2E test framework that runs against a live RobOS VM, using the DOM snapshot debug servers (port 19100+) to control apps, verify state, and run smoke/regression tests. Every app feature gets a smoke test. This is how we build with confidence.

## Why This Is Critical

We already have the building blocks:
- DOM snapshot debug servers on every app (text snapshots, JSON DOM, screenshots, /eval)
- SSH access to the VM (port 2224)
- Apps discoverable via .desktop files

What's missing is the **test runner** that ties it all together — launch apps, interact via /eval, assert on DOM snapshots, capture screenshots on failure, and report results.

## Architecture

```
Host machine (test runner)
  │
  ├── robos-test CLI
  │     ├── Launch app via SSH + DISPLAY=:0
  │     ├── Wait for debug server health check
  │     ├── Execute test steps (click, type, wait, assert)
  │     ├── Capture DOM snapshot after each step
  │     ├── Screenshot on failure
  │     └── Report pass/fail
  │
  └── SSH tunnel to VM (port 2224)
        └── App debug servers (19100+)
              ├── GET  /text-snapshot  → DOM tree
              ├── GET  /snapshot       → JSON DOM
              ├── GET  /screenshot     → PNG
              ├── POST /eval           → execute JS
              └── GET  /health         → app status
```

## Test Types

- **Smoke tests**: App launches, renders expected elements, basic interactions work
- **Regression tests**: Specific bug scenarios that must not recur
- **Feature tests**: Full user flows (e.g., install a tool, verify status changes)
- **Cross-app tests**: Workflows spanning multiple apps (e.g., task → workspace → IDE)

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [robos-test runner library and CLI](story-01-test-runner.md) | Not started | 8 |
| 02 | [Test assertion DSL (DOM matchers, text snapshots)](story-02-assertion-dsl.md) | Not started | 5 |
| 03 | [App launcher smoke tests](story-03-app-launcher-smoke.md) | Not started | 3 |
| 04 | [Dev Tools smoke tests (install/uninstall flow)](story-04-dev-tools-smoke.md) | Not started | 3 |
| 05 | [Screenshot-on-failure and HTML test report](story-05-screenshot-report.md) | Not started | 3 |
| 06 | [CI integration — run tests in headless VM](story-06-ci-integration.md) | Not started | 5 |
| 07 | [Regression test template and /create-test command](story-07-regression-template.md) | Not started | 3 |
| 08 | [Cross-app workflow tests](story-08-cross-app-tests.md) | Not started | 5 |
