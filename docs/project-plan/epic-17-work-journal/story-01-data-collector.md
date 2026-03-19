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

## Acceptance Criteria

- [ ] Events from at least 5 sources captured
- [ ] Events written within 60s of occurrence
- [ ] Event file rotated daily (one file per day)
- [ ] Daemon starts on login, runs in background
