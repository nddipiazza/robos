---
nav_exclude: true
---

# RobOS Work Journal

**Status:** Not started
**Priority:** Critical
**Dependencies:** Task Management, System Services

An AI-powered journal that automatically tracks everything the developer works on throughout the day. No manual logging — AI watches task server activity, git operations, CI pipelines, PR reviews, and IDE events, then synthesizes a structured daily journal entry.

## Why This Is Critical

Developers waste time reconstructing what they did for standups, timesheets, and sprint reviews. The journal does it automatically:

- "What did I work on yesterday?" → AI generates the answer
- "How many hours on JIRA-1234?" → Journal knows, because it tracked the workspace
- "What's blocking me?" → Journal shows PRs waiting for review, CIs stuck, tasks stalled

The journal is git-backed and shareable — managers can see it, teammates can reference it, and it feeds into the AI standup in Dev Central.

## Data Sources (all automatic)

| Source | What it captures |
|--------|-----------------|
| **Task Server** (Jira/GitHub) | Tasks started/completed, status transitions, hours logged, comments added |
| **Git** | Branches created/switched, commits, pushes, merges |
| **Pull Requests** | PRs opened/reviewed/merged, review comments given/received, time-to-merge |
| **CI/CD** | Builds triggered, pass/fail, deploy events, time waiting for CI |
| **IDE Events** | Files opened/edited, debug sessions, run configurations executed |
| **AI Agent Sessions** | Agent tasks, draft completions, questionnaire answers, quiz results |
| **Reviews** | PRs waiting for your review (and how long), reviews you're waiting on |
| **Manual Notes** | Voice dictation or typed notes the developer adds |

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Journal data collector daemon](story-01-data-collector.md) | Not started | 5 |
| 02 | [Journal storage (git-backed daily entries)](story-02-journal-storage.md) | Not started | 3 |
| 03 | [AI daily summary generator](story-03-ai-daily-summary.md) | Not started | 5 |
| 04 | [Journal viewer app (timeline + detail views)](story-04-journal-viewer.md) | Not started | 5 |
| 05 | [Task-linked time tracking (automatic hours)](story-05-time-tracking.md) | Not started | 5 |
| 06 | [Blocking items tracker (PRs waiting, CIs stuck)](story-06-blocking-tracker.md) | Not started | 3 |
| 07 | [Manual notes and voice dictation entries](story-07-manual-notes.md) | Not started | 3 |
| 08 | [Journal sharing and team feed](story-08-team-sharing.md) | Not started | 3 |
| 09 | [Journal MCP server (for AI standup generation)](story-09-journal-mcp.md) | Not started | 3 |
