---
nav_exclude: true
---

# Story 17-03: AI Daily Summary Generator

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 5

## Description

AI reads the day's raw events and generates a natural-language summary at the top of each journal entry. Runs at end-of-day (configurable, default 5pm) and can be triggered manually.

### Summary includes:
- What tasks were worked on and their outcomes
- Key accomplishments (PRs merged, bugs fixed, features completed)
- Blockers encountered (CI failures, long review waits)
- Time breakdown by task
- Tomorrow's plan (tasks in progress, reviews pending)

### Standup format (for Dev Central):
```
Yesterday: Fixed platform crash BUG-42 (PR merged), started validation engine US-7
Today: Continue US-7, review Bob's PR #38
Blockers: None
```

AI uses the journal events + task server context to generate this. No manual input needed.

## Acceptance Criteria

- [ ] Summary generated automatically at configured time
- [ ] Standup format available for Dev Central dashboard
- [ ] Summary is accurate (references real task IDs, PR numbers, times)
- [ ] Can regenerate summary manually
