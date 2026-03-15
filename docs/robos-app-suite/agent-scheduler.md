---
layout: default
title: Agent Scheduler
parent: RobOS App Suite
nav_order: 23
---

# Agent Scheduler

> Schedule AI agent jobs to run automatically on a cron-like schedule.

---

## Overview

Agent Scheduler lets you define recurring AI agent tasks — daily standup summaries, nightly code review scans, weekly report generation — and run them on a configurable schedule. Jobs are stored as named schedule entries, each with a prompt template, a working directory, and a cron expression. Execution logs are retained per job.

---

## Features

- Create named schedule entries with prompt, working directory, and cron expression
- Visual cron expression builder (no need to memorise syntax)
- Enable / disable individual schedules without deleting them
- Per-job execution log retained in `logs/`
- System job settings for built-in RobOS recurring tasks (e.g. PR digest, standup summary)
- Integrates with [Git Projects](git-projects) — can target a specific project's working directory
- Emits Notification Bus events on job completion or failure
- Workflow Studio draft support — jobs can be built as workflow drafts before scheduling

---

## How to Open

```bash
/usr/local/share/robos/agent-scheduler/launch.sh
```

---

## Usage

### Creating a schedule

1. Click **+ New Schedule**.
2. Enter:
   - **Name** — descriptive label
   - **Prompt** — the agent prompt template (supports `{{date}}`, `{{project}}` variables)
   - **Working Directory** — directory the agent runs in
   - **Cron expression** — e.g. `0 9 * * 1-5` for 9 AM weekdays
3. Click **Save**. The schedule is active immediately.

### Viewing job logs

Click a schedule entry and open the **Logs** tab. Each run is listed with start time, duration, exit code, and truncated output. Click a run to see the full output.

### System job settings

The **System Jobs** tab shows built-in RobOS jobs (PR digest at 10:00 and 16:00, standup summary at 9:00). Toggle each on/off and adjust their times.

---

## Configuration

No separate config keys. All schedules stored in `schedules.json`.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-schedules` | Renderer → Main | Returns all schedule entries |
| `add-schedule` | Renderer → Main | Creates a new schedule entry |
| `update-schedule` | Renderer → Main | Updates an existing schedule |
| `delete-schedule` | Renderer → Main | Removes a schedule |
| `toggle-schedule` | Renderer → Main | Enables or disables a schedule |
| `get-job-logs` | Renderer → Main | Returns execution log entries for a schedule |
| `run-now` | Renderer → Main | Triggers an immediate run of a schedule |
| `get-system-job-settings` | Renderer → Main | Returns built-in job config |
| `save-system-job-settings` | Renderer → Main | Updates built-in job config |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/agent-scheduler/schedules.json` | All user-defined schedule entries |
| `~/.config/robos/agent-scheduler/logs/<id>/` | Per-job execution logs |
| `~/.config/robos/system-job-settings.json` | Built-in RobOS recurring job settings |
| `~/.config/robos/workflow-studio-drafts/` | Workflow draft files used when building jobs |
| `~/.config/robos/git-projects.json` | Read to populate working directory picker |
