---
title: "RobOS CLI Tools"
package: robos-cli
category: services
summary: "Four shell scripts for scripts and agents: send a notification, set the active task, append to the work journal, and emit or read events."
description: "robos-notify, robos-active-task, robos-journal-append and robos-event, plus a small console window that runs them for testing. They write plain files under ~/.config/robos."
---

The scripts in `packages/robos-cli` let scripts, cron jobs and agents talk to other RobOS apps without an API. Each is a bash script that calls `python3` for JSON handling. They are listed under `bin` in `package.json`.

## robos-notify

Sends a notification and stores it in `~/.config/robos/notifications.json`, which the [Toast Daemon]({{ '/apps/robos-toast/' | relative_url }}) reads. The file keeps the newest 500 entries.

```bash
robos-notify "Build passed" --title "CI" --category ci_cd --tier info
echo '{"title":"Deploy","message":"v1.3.1","category":"ci_cd","tier":"info"}' | robos-notify --json
```

Categories are `pr_review`, `ci_cd`, `task`, `agent` and `system` (default). Tiers are `critical`, `warning` and `info` (default). `--silent` records the notification without showing a toast. Without `--silent` it also calls `notify-send` if installed, and sends a message to `/run/user/<uid>/robos-dm.sock` if that socket exists. `--action CMD` is accepted and parsed but the script does not store or run it.

## robos-active-task

Reads or writes the file `~/.config/robos/active-issue`.

```bash
robos-active-task set JIRA-42
robos-active-task get      # prints the id, or "No active task" and exits 1
robos-active-task clear
```

## robos-journal-append

Appends a timestamped bullet to today's journal file at `daily/<YYYY-MM-DD>.md` in a git repository, then commits and tries to push.

```bash
robos-journal-append "Discussed API design with Bob"
robos-journal-append --section Tasks --type decision "Switching to proto reflection"
```

The default section is `Notes`; a new daily file starts with the sections Tasks, Notes and Projects. The repository is `~/source/github.com/<org>/<repo>` for the `journal_repo` value in `~/.config/robos/settings.json` if that folder exists, otherwise `~/.config/robos/journal` (initialized with `git init`). Options are `--section`, `--date YYYY-MM-DD` and `--type`.

## robos-event

An append-only event log at `~/.config/robos/events/event-log.jsonl`.

```bash
robos-event emit ci_completed --payload '{"runId":789,"status":"failure"}'
robos-event listen --category ci_cd
robos-event history --last 50 --since 1h
```

`listen` follows the file with `tail -f`. `--category` filters by a fixed mapping from category to event type names (for example `ci_cd` matches `ci_started`, `ci_completed` and `deploy`). `--since` takes values like `30m`, `1h` or `1d`. The `/run/user/<uid>/robos-events.sock` path is defined in the script but not used.

## The console window

Open **RobOS CLI Console** to run each script from a form (title, message, category and tier for `robos-notify`; a task id for `robos-active-task`; entry, section and type for `robos-journal-append`; event type and JSON payload for `robos-event`) and see the output in a terminal pane. The package has no `.desktop` launcher; run it with `electron .` in `packages/robos-cli`.

The folder also holds `robos-voice`, the command-line client for [RobOS Voice]({{ '/apps/voice-prompt/' | relative_url }}). It is not in the `bin` list.
