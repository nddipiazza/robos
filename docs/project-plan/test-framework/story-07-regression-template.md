---
nav_exclude: true
---

# Story 16-07: Regression Test Template and /create-test Command

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 3

## Description

Claude command `/create-test` that generates a regression test for a specific bug or feature. Also a standard template so all tests follow the same pattern.

### Test Template

```javascript
const { test, launch } = require('robos-test');

test('<app-id>: <description>', async (t) => {
  const app = await launch('<app-id>');
  
  // Setup: navigate to the relevant state
  // ...
  
  // Action: perform the action that triggers the bug/feature
  // ...
  
  // Assert: verify the expected outcome
  // ...
  
  await app.close();
});
```

### /create-test Command

Input: `<app-id> <description of what to test>`

Generates:
- Test file at `tests/<app-id>/<slug>.test.js`
- Pre-filled with launch, setup, action, and assertion steps
- Comments explaining what each section should do

### Convention

- Test files: `tests/<app-id>/<name>.test.js`
- Smoke tests: `tests/<app-id>/smoke.test.js`
- Regression tests: `tests/<app-id>/regression-<bug-id>.test.js`
- Feature tests: `tests/<app-id>/<feature-name>.test.js`

## Acceptance Criteria

- [ ] /create-test generates a working test skeleton
- [ ] Template is consistent across all apps
- [ ] Test discovery finds all test files automatically
