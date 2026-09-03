---
nav_exclude: true
---

# Story 17-01: Journal Data Collector Daemon

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 5

## Description

Background service that continuously collects activity events from all data sources and writes them to ~/.config/robos/journal-events.json.

### Event Types

```json
{ "type": "task_started", "ts": "2026-03-18T09:15:00Z", "taskId": "JIRA-1234", "title": "Fix platform crash" }
{ "type": "task_status_changed", "ts": "...", "taskId": "JIRA-1234", "from": "In Progress", "to": "In Review" }
{ "type": "branch_created", "ts": "...", "repo": "buildbarn-forms", "branch": "fix/bug-42-platform-crash" }
{ "type": "commit", "ts": "...", "repo": "buildbarn-forms", "sha": "abc123", "message": "fix: null guard on platform" }
{ "type": "pr_opened", "ts": "...", "repo": "buildbarn-forms", "prNumber": 42, "title": "Fix platform crash" }
{ "type": "pr_review_requested", "ts": "...", "prNumber": 42, "reviewer": "alice" }
{ "type": "pr_review_received", "ts": "...", "prNumber": 42, "reviewer": "alice", "state": "approved" }
{ "type": "pr_merged", "ts": "...", "prNumber": 42 }
{ "type": "ci_started", "ts": "...", "repo": "buildbarn-forms", "runId": 789, "branch": "fix/bug-42" }
{ "type": "ci_completed", "ts": "...", "runId": 789, "status": "success", "duration": 142 }
{ "type": "deploy", "ts": "...", "env": "staging", "version": "1.3.1" }
{ "type": "agent_session", "ts": "...", "agent": "claude", "taskId": "JIRA-1234", "action": "draft_completed" }
{ "type": "file_edited", "ts": "...", "file": "src/components/PlatformMatcher.tsx" }
{ "type": "manual_note", "ts": "...", "text": "Discussed API design with Bob, decided to use proto reflection" }
```

### Collection Methods

- **Task server polling**: Poll Jira/GitHub every 60s for status changes on assigned tasks
- **Git hooks**: Post-commit, post-checkout hooks write events
- **GitHub webhook/polling**: PR events, review events, CI status
- **IDE bridge**: File open/edit events from JetBrains/VS Code
- **Agent IPC**: AI Agent Manager sends session events
- **robos-journal-append CLI**: Manual entries from terminal

### Event Bus Publication

In addition to writing events to the journal events file, the collector publishes every event to the RobOS Event Bus (Epic 18, story 18-01) when available. This enables the Rule Engine and other subscribers to react to SDLC events in real-time.

**Publication behavior:**
- Each collected event is wrapped in the Event Bus envelope format (`id`, `type`, `ts`, `source: "journal-collector"`, `category`, `payload`)
- Category is auto-derived from event type via the `robos-lib` category mapping table
- Publication is fire-and-forget — if the Event Bus is not running, the collector logs a debug message and continues writing to the journal file
- No event is lost: the journal file is the primary store, the Event Bus is a secondary fanout channel

**Event type → category mapping:**

| Event Type | Category |
|------------|----------|
| task_started, task_status_changed | task |
| branch_created, commit, file_edited | git |
| pr_opened, pr_review_requested, pr_review_received, pr_merged | pr_review |
| ci_started, ci_completed, deploy | ci_cd |
| agent_session | agent |
| manual_note | journal |

## Acceptance Criteria

- [ ] Events from at least 5 sources captured
- [ ] Events written within 60s of occurrence
- [ ] Event file rotated daily (one file per day)
- [ ] Daemon starts on login, runs in background
- [ ] Every collected event published to Event Bus when available
- [ ] Publication uses Event Bus envelope format with auto-derived category
- [ ] Collector continues working normally if Event Bus is unavailable
