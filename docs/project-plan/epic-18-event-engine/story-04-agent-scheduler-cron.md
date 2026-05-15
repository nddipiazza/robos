---
nav_exclude: true
---

# Story 18-04: Agent Scheduler — Cron Jobs

**Epic:** [Event Engine & Agent Scheduler](epic.md)
**Status:** Not started
**Points:** 5

## Description

Cron-based recurring job scheduler that executes actions on a time-based schedule. Jobs are defined in `~/.config/robos/scheduled-jobs.json` and managed via the Automation Studio UI (story 18-03) or CLI.

### Job Model

```json
{
  "id": "job_001",
  "name": "Daily PR cleanup reminder",
  "enabled": true,
  "schedule": "0 9 * * 1-5",
  "actions": [
    {
      "type": "run_script",
      "params": { "command": "gh pr list --author @me --state open --json number,title" }
    },
    {
      "type": "notify",
      "params": { "tier": "info", "category": "pr_review", "title": "Open PR Reminder", "message": "You have open PRs to review" }
    }
  ],
  "lastRun": null,
  "nextRun": "2026-03-21T09:00:00Z",
  "lastStatus": null
}
```

### Scheduler Implementation

- Background process (Node.js) that loads jobs from `scheduled-jobs.json`
- Evaluates cron expressions using `node-cron` or equivalent library
- Computes and stores `nextRun` for each job
- When a job fires: executes actions via Action Registry (story 18-06), updates `lastRun` and `lastStatus`
- Emits an event to the Event Bus: `{"type":"scheduled_job_executed","category":"system","payload":{"jobId":"job_001","status":"success"}}`

### Job Lifecycle

- **Create**: Add job via Automation Studio UI or direct JSON edit
- **Enable/Disable**: Toggle without deleting
- **Run Now**: Manual trigger from UI (fires immediately regardless of schedule)
- **History**: Last 50 runs stored in `~/.config/robos/job-history/{jobId}.jsonl`

### Error Handling

- If an action fails, log the error and set `lastStatus` to `"error"` with error message
- Failed actions do not block subsequent actions in the chain (each runs independently)
- Persistent failures (3+ consecutive) emit a `system` category warning notification

### Example Jobs

- **Daily standup prep**: Every weekday at 8:45 AM, run AI agent to summarize yesterday's work from journal
- **PR cleanup reminder**: Every weekday at 9 AM, list open PRs and notify
- **Dependency check**: Weekly, run `npm audit` across all repos and notify if vulnerabilities found
- **Event log cleanup**: Daily at midnight, remove event log files older than retention period

## Acceptance Criteria

- [ ] Scheduler loads jobs from `~/.config/robos/scheduled-jobs.json`
- [ ] Cron expressions evaluated correctly (minute, hour, day, month, weekday)
- [ ] Jobs execute actions via Action Registry at scheduled times
- [ ] `nextRun` computed and updated after each execution
- [ ] Manual "Run Now" triggers immediate execution
- [ ] Job execution history stored in per-job JSONL files
- [ ] Job execution events published to Event Bus
- [ ] Failed actions logged with error details; 3+ consecutive failures trigger notification
- [ ] Scheduler starts on login and runs as background process
- [ ] Hot-reload when `scheduled-jobs.json` changes
