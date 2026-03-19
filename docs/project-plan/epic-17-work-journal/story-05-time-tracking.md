# Story 17-05: Task-Linked Time Tracking (Automatic Hours)

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 5

## Description

Automatically track time spent on each task based on workspace activity. When a developer has a workspace open for JIRA-1234, the clock runs. When they switch to another task, the clock switches. No manual time entry needed.

### How it works
1. Workspace Manager reports active task via IPC
2. Journal collector tracks workspace switches as events
3. Time is accumulated per task per day
4. At end of day, AI calculates total hours per task
5. Hours can be auto-logged to task server (Jira worklog, GitHub comment)

### Time breakdown
```
2026-03-18 Time Summary:
  BUG-42  Fix platform crash      1h 32m  (09:15–10:47)
  US-7    Validation engine        2h 15m  (13:00–15:15)
  Reviews PR #38 review            0h 20m  (15:30–15:50)
  ─────────────────────────────────────────
  Total                            4h 07m
```

### Edge cases
- Idle detection: if no keyboard/mouse for 15 min, pause the clock
- Meeting detection: if calendar shows a meeting, don't count as task time
- Multi-task: developer has two workspaces open — count the focused one

## Acceptance Criteria

- [ ] Time tracked per task without manual entry
- [ ] Idle time excluded (configurable threshold)
- [ ] Hours logged to task server automatically (opt-in)
- [ ] Daily time breakdown in journal entry
