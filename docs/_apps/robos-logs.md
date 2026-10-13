---
title: "System Logs Viewer"
package: robos-logs
category: core-desktop
icon: robos-logs.svg
summary: "Viewer for the structured logs that RobOS apps write to ~/.config/robos/logs, with search and level filters."
description: "Reads the per-app NDJSON log files, lets you filter by app, level and text, refresh them every 3 seconds, and clear one app's log."
---

RobOS Logs reads the files that RobOS apps write through the shared logger in `packages/robos-lib/logger.js`. It is a viewer only; it does not collect logs from other places.

## Log files

Each app that uses the logger writes one JSON object per line to `~/.config/robos/logs/<app-id>.ndjson`, with the fields `ts`, `app`, `level`, `event`, `msg` and any extras. Entries at level `error` are also copied to `~/.config/robos/logs/errors.ndjson`. A file is rotated when it passes 5 MB, and the three newest rotated files are kept. If you run an app from a terminal and it logs nothing, check that app uses the logger.

## Use it

- The **Apps** sidebar lists every app that has a log file. **All Apps** merges them.
- Level buttons filter the table: **ALL**, **INFO**, **WARN**, **ERROR**, **DEBUG**.
- The search box filters by text (after a short delay). The table has the columns Time, App, Level, Event and Message.
- Click a row to open **Event Detail**, which shows the full JSON entry. This is where error stacks logged in the `stack` field appear.
- **Live tail** (a checkbox) reloads every 3 seconds. **Refresh** reloads once.
- **Clear** empties the log file of the selected app, after a confirmation. It is disabled in effect for **All Apps**: you must select one app.

The viewer logs its own start-up as `app-started` under `robos-logs`.

## Run it

Launch **RobOS Logs** from the app launcher, or run `npm start` in `packages/robos-logs`. Only one window runs at a time.
