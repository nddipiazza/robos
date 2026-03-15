---
layout: default
title: robos-cli (Shared CLI & Node.js Library)
parent: RobOS App Suite
nav_order: 31
---

# robos-cli

> Shared Node.js library and bash helper scripts used by every RobOS Electron app's main process and the OS shell layer.

---

## Overview

`robos-cli` is the shared back-end runtime for RobOS. It provides:

1. **`robos-copilot-lib.js`** — a Node.js module that every Electron main process `require()`s to invoke Copilot CLI consistently (streaming, swim-lane activity tracking, journal logging)
2. **`robos-active-task`** — bash script to get/set the currently active Jira/GitHub issue
3. **`robos-notify`** — bash script to send a desktop notification and append it to the notifications store
4. **`robos-journal-append`** — bash script to write entries to the Work Journal from cron or other scripts

---

## Installed Location

```
/usr/local/share/robos/robos-copilot-lib/
├── index.js               ← robos-copilot-lib.js (the Node require target)
├── package.json
├── robos-active-task      ← symlinked to /usr/local/bin/robos-active-task
├── robos-notify           ← symlinked to /usr/local/bin/robos-notify
└── robos-journal-append   ← symlinked to /usr/local/bin/robos-journal-append
```

Electron main processes require it as:

```js
const copilot = require('/usr/local/share/robos/robos-copilot-lib');
```

---

## `robos-copilot-lib.js` — Node.js API

### `copilot.ask(prompt)` → `{ ok, text, error }`

Fire-and-collect: runs `gh copilot suggest` and returns the full output as a string.

```js
const { ok, text, error } = await copilot.ask('Explain this stack trace: ...');
if (ok) console.log(text);
```

### `copilot.stream(prompt, options)` → `{ ok, text }`

Streaming call with live chunk delivery. Shows in the swim-lane activity overlay.

```js
const { ok, text } = await copilot.stream('Suggest a fix for...', {
  title: 'AI fix suggestion',            // label shown in swim-lane overlay
  onChunk: (chunk) => {
    sender.send('copilot-output', { text: chunk });
  },
});
```

| Option | Type | Description |
|---|---|---|
| `title` | string | Label shown in the desktop swim-lane overlay |
| `onChunk` | function | Called with each partial output chunk |
| `cwd` | string | Working directory for the subprocess |

### `copilot.session(prompt, options)` → `{ ok, text, sessionId }`

Full agent session (`gh copilot -- -p <prompt> --allow-all-tools`). Used for long-running agentic tasks.

```js
const { ok, text, sessionId } = await copilot.session(prompt, {
  cwd: '/home/robos/source/myproject',
  sessionId: existingSessionId,   // resume a prior session
  onChunk: (chunk) => sender.send('copilot-chunk', chunk),
});
```

### Swim-Lane Activity Tracking

Every call writes a file to `~/.config/robos/copilot-streams/<uuid>.json` while in flight and deletes it on completion. The desktop overlay widget reads this directory to show which apps are currently waiting on AI responses.

### Journal Integration

On completion of any `stream()` or `session()` call, `robos-copilot-lib` appends a structured entry to `~/.config/robos/journal-events.json` containing the prompt, response length, duration, and result status. The Work Journal app surfaces these entries.

---

## Bash Helper Scripts

### `robos-active-task`

Get or set the current active task (displayed in the desktop task widget).

```bash
robos-active-task                     # print current active task
robos-active-task "PROJ-123 Fix login bug"  # set active task
robos-active-task --clear             # clear active task
```

State stored in `~/.config/robos/active-issue`.

### `robos-notify`

Send a desktop notification and append to the RobOS notifications store.

```bash
robos-notify "Title" "Message body" [icon-type]
# icon-type: info (default) | warning | error | success | start
```

Notifications are stored in `~/.config/robos/notifications.json` and shown in the Notifications app.

### `robos-journal-append`

Append a text entry to the Work Journal from a script or cron job.

```bash
robos-journal-append "Deployed fix for PROJ-123 to staging"
robos-journal-append --section "Standup" --date "2025-03-11" "Fixed auth timeout"
```

| Flag | Default | Description |
|---|---|---|
| `--section` | `"Notes"` | Journal section heading |
| `--date` | today | ISO date `YYYY-MM-DD` |

Writes directly to the git-backed journal data directory (`~/.config/robos/journal/`).

---

## Configuration

`robos-copilot-lib` reads `~/.config/robos/settings.json` at startup. Relevant keys:

| Key | Description |
|---|---|
| `copilotModel` | Model to pass to `gh copilot` (default: system default) |
| `copilotTimeout` | Max seconds to wait for a response (default: 120) |

---

## Source

```
packages/robos-cli/
├── robos-copilot-lib.js
├── robos-active-task
├── robos-notify
├── robos-journal-append
└── robos-context.md        ← context prompt injected into all AI calls
```
