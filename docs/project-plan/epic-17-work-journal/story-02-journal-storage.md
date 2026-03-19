# Story 17-02: Journal Storage (Git-Backed Daily Entries)

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 3

## Description

Journal entries stored as markdown files in a git repo. One file per day. Structure:

```
~/.config/robos/journal/
├── .git/
├── 2026/
│   └── 03/
│       ├── 2026-03-17.md
│       ├── 2026-03-18.md
│       └── 2026-03-19.md
└── journal.json  (metadata: task links, time totals)
```

### Daily Entry Format

```markdown
# 2026-03-18 — Tuesday

## AI Summary
Fixed platform matcher crash in buildbarn-forms (BUG-42). Created PR #42,
got review from Alice, merged and deployed to staging. Also started on
worker config form validation (US-7).

## Tasks
- **BUG-42** Fix platform crash — In Progress → Merged (1.5h)
- **US-7** Validation engine — Not Started → In Progress (2h)

## Activity Timeline
- 09:15 Started BUG-42
- 09:20 Branch: fix/bug-42-platform-crash
- 09:45 Commit: fix null guard on platform field
- 09:50 PR #42 opened
- 10:05 CI passed
- 10:15 Review requested: Alice
- 11:30 Review received: approved
- 11:32 PR merged
- 11:40 Deployed to staging
- 13:00 Started US-7
- 13:15 Branch: feat/us-7-validation-engine
- ...

## PRs
- **#42** fix: platform crash — opened 09:50, merged 11:32 (1h42m, 1 review cycle)

## Reviews Waiting
- PR #38 by Bob — waiting since 2026-03-17 (1 day)

## Manual Notes
- 14:30 Discussed API design with Bob, decided to use proto reflection
```

Auto-committed to git every 30 minutes and at end of day.

## Acceptance Criteria

- [ ] One markdown file per day, human-readable
- [ ] Git-backed with automatic commits
- [ ] Shareable via git push to team remote
- [ ] Searchable across all days (grep)
