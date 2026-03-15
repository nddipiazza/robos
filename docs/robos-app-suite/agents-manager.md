---
layout: default
title: Agents Manager
parent: RobOS App Suite
nav_order: 8
---

# Agents Manager

> Launch, monitor, and manage Copilot CLI agent sessions from a central dashboard.

---

## Overview

Agents Manager is the control plane for all AI agent activity on RobOS. It lists active and historical Copilot CLI sessions, lets you start new sessions with pre-configured prompts, and streams live output from running agents. It integrates with the Notification Bus so agent completions can surface as desktop toasts.

---

## Features

- Live list of running and completed Copilot CLI sessions
- Start a new agent session with a custom prompt and working directory
- Stream real-time agent output to the in-app terminal pane
- Stop (kill) a running agent session
- Session history with timestamps and exit codes
- One-click re-run of a previous session prompt
- Notification Bus integration — emits `AGENT_COMPLETE` on session exit

---

## How to Open

```bash
/usr/local/share/robos/agents-manager/launch.sh
```

Or click the **Agents** icon in the tint2 panel.

---

## Usage

### Starting a new session

1. Click **+ New Session**.
2. Enter a prompt and optionally set the working directory.
3. Click **Run**. The agent starts and output streams to the terminal pane.

### Monitoring a running session

Click any active session in the list. The terminal pane switches to that session's output stream.

### Stopping a session

Click **■ Stop** in the session row or the active session panel. The main process sends `SIGTERM` to the agent.

### Reviewing history

Completed sessions appear in the **History** tab with prompt, exit code, and duration. Click **▶ Re-run** to launch the same prompt again.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `copilot_cli_path` | Path to the `gh copilot` or custom CLI binary (default: `gh`) |
| `default_agent_cwd` | Default working directory for new sessions (default: `~`) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-sessions` | Renderer → Main | Returns list of active and historical sessions |
| `start-session` | Renderer → Main | Spawns a new Copilot CLI process; returns session ID |
| `stop-session` | Renderer → Main | Sends SIGTERM to the session process |
| `session-output` | Main → Renderer | Streams stdout/stderr chunks for a session |
| `session-exit` | Main → Renderer | Emitted when a session exits with `{ code, sessionId }` |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | `copilot_cli_path`, `default_agent_cwd` |
| `~/.config/robos/agent-sessions.json` | Persisted session history |
