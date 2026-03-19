# Story 17-06: Blocking Items Tracker

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 3

## Description

Track items that are blocking the developer or that the developer is blocking others on. Shows in the journal and feeds into Dev Central's blocker radar.

### Tracked blockers
- **PRs waiting for review**: Your PRs that no one has reviewed yet, with wait time
- **PRs you need to review**: Others' PRs assigned to you, with wait time
- **CI stuck**: Builds that have been running unusually long or are failing repeatedly
- **Tasks stalled**: Tasks that haven't progressed in X days
- **Dependencies**: Tasks blocked by other tasks that aren't done

### Journal section
```
## Blockers
- ⏳ PR #42 waiting for review from Alice (2h 15m)
- 🔴 CI failing on feat/us-7-validation — TypeScript error (3 runs)
- ⚠️ US-8 blocked by US-7 (validation engine not ready)

## You're Blocking
- ⏳ PR #38 by Bob — waiting for your review (1 day)
```

## Acceptance Criteria

- [ ] Blockers detected automatically from task server + CI + PR data
- [ ] Wait times calculated accurately
- [ ] "You're blocking" section shows what others are waiting on from you
- [ ] Feeds into Dev Central blocker radar widget
