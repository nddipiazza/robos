---
nav_exclude: true
---

# Story 20-04: Deep E2E Tests for task-board

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 5
**Dependencies:** Stories 01, 02

## Description

Replace the shallow task-board E2E tests with deep interaction tests that verify issues actually render from stub data and that UI controls work.

### Tests

1. **Issues render on the board** — Launch with `github-task-server`. Wait for issue titles from stub (5 issues). Assert all visible.

2. **View toggle** — Click List view button, verify DOM changes. Click Board to switch back.

3. **State filter** — Select "closed" state filter. Verify closed issues appear and open issues disappear.

4. **Issue card content** — Verify cards show labels (colored badges), assignee info, milestone when present.

5. **Error state** — Launch with `no-task-servers`. Verify error message. Confirm no issue cards.

### Example

```javascript
it('renders issues from GitHub stub', async () => {
  app = await launchApp('task-board', scenarios['github-task-server']);
  await waitForText(app.port, 'Worker pool exhaustion');
  const snap = await getSnapshot(app.port);
  const text = flatText(snap);
  assert.ok(text.includes('Worker pool exhaustion'));
  assert.ok(text.includes('Add CAS deduplication'));
  assert.ok(text.includes('Scheduler queue priority'));
});
```

## Acceptance Criteria

- [ ] Test verifies all 5 stub issues render in the board view
- [ ] Test toggles between board and list view and verifies DOM changes
- [ ] Test filters by state and verifies correct issues shown
- [ ] Test verifies issue cards contain labels and assignee info
- [ ] Test verifies error state when no task server configured
- [ ] All tests pass in headless mode
