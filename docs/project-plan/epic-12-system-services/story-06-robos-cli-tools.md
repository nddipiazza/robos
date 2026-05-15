---
nav_exclude: true
---

# Story 12-06: robos-cli Tools — Notify, Active Task, Journal, Events

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

CLI utilities installed to `/usr/local/bin/`. Used by agent scheduler, CI scripts, event rules, and other automation.

### robos-notify — Send Categorized Notifications

Send toast notifications from terminal/scripts with full category and tier support:

```bash
# Basic usage
robos-notify "Build passed" --title "CI"

# With category and tier
robos-notify "PR #42 needs review" --category pr_review --tier warning

# Critical CI failure
robos-notify "CI failed on fix/bug-42" --category ci_cd --tier critical --action "robos-app code-review --pr 42"

# JSON mode (for piping from scripts)
echo '{"title":"Deploy","message":"v1.3.1 to staging","category":"ci_cd","tier":"info"}' | robos-notify --json
```

Flags:
- `--category <cat>` — One of: pr_review, ci_cd, task, agent, system (default: system)
- `--tier <tier>` — One of: critical, warning, info (default: info)
- `--title <text>` — Notification title
- `--action <cmd>` — Command to execute on click
- `--json` — Read notification from stdin as JSON
- `--silent` — Write to history only, skip toast display

### robos-active-task — Session Task Management

Get/set the currently active task for the session:

```bash
robos-active-task get          # Print current task ID
robos-active-task set JIRA-42  # Set active task
robos-active-task clear        # Clear active task
```

### robos-journal-append — Journal Entries from CLI

Write journal entries from CLI/cron:

```bash
robos-journal-append "Discussed API design with Bob"
robos-journal-append --type decision "Switching to proto reflection for API discovery"
```

### robos-event — Event Bus CLI

Emit and listen to events on the RobOS Event Bus (Epic 18):

```bash
# Emit an event
robos-event emit ci_completed --payload '{"runId":789,"status":"failure","repo":"my-app"}'

# Listen to events (streaming, NDJSON output)
robos-event listen                          # All events
robos-event listen --type ci_completed      # Filter by type
robos-event listen --category ci_cd         # Filter by category

# Query recent events
robos-event history --last 50               # Last 50 events
robos-event history --category pr_review --since 1h
```

The `robos-event` CLI connects to the Event Bus Unix socket at `/run/user/{uid}/robos-events.sock`. Falls back gracefully with an error message if the Event Bus is not running.

## Acceptance Criteria

- [ ] `robos-notify` sends categorized, tiered notifications via IPC to Toast Daemon
- [ ] `robos-notify --category` and `--tier` flags work with all valid values
- [ ] `robos-notify --json` reads notification from stdin
- [ ] `robos-active-task` get/set/clear works and persists to `~/.config/robos/active-task`
- [ ] `robos-journal-append` writes entries to journal event file
- [ ] `robos-event emit` publishes events to the Event Bus socket
- [ ] `robos-event listen` streams events with optional type/category filter
- [ ] `robos-event history` queries persisted event log files
- [ ] All CLIs installed to `/usr/local/bin/` and work without sudo
- [ ] All CLIs print help with `--help` flag
