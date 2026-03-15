---
layout: default
title: Copilot Session Viewer
parent: RobOS App Suite
nav_order: 25
---

# Copilot Session Viewer

> Replay and inspect Copilot CLI session logs — browse checkpoints, diffs, and agent reasoning.

---

## Overview

Copilot Session Viewer is a read-only inspection tool for Copilot CLI session history. It reads the session state directories written by the GitHub Copilot CLI and presents them in a structured UI: checkpoint timeline, file diffs, tool call logs, and the final summary. Developers use it to review what an AI agent did, understand its reasoning, and audit changes before committing.

---

## Features

- Browse all session directories under the Copilot CLI session state root
- Timeline view of checkpoints with titles and timestamps
- Per-checkpoint diff viewer — shows exactly what files were changed in each checkpoint
- Tool call log — lists every tool the agent invoked with inputs and outputs
- Session summary panel — final summary text from the agent
- Search across checkpoint titles and summaries
- Copy diff patches to clipboard for manual application
- Open any changed file in the system default editor

---

## How to Open

```bash
/usr/local/share/robos/copilot-session-viewer/launch.sh
```

---

## Usage

### Browsing sessions

The left panel lists all sessions ordered by most recent. Each entry shows the session date and the title of the most recent checkpoint.

### Viewing a checkpoint timeline

Click a session. The centre panel shows the checkpoint timeline. Click any checkpoint to load its diff and tool log.

### Reviewing diffs

The diff pane shows a syntax-highlighted unified diff for each checkpoint. Use the file selector dropdown to switch between changed files.

### Reviewing tool calls

The **Tool Calls** tab for each checkpoint lists every tool invoked — file reads, bash commands, edits, searches — with their inputs and outputs.

### Copying a patch

Click **Copy Patch** on any diff to copy the raw unified diff to clipboard, suitable for `git apply`.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `copilot_session_state_dir` | Path to the Copilot CLI session state directory (default: `~/.copilot/session-state`) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-sessions` | Renderer → Main | Returns list of session directories with metadata |
| `get-checkpoints` | Renderer → Main | Returns checkpoint list for a session |
| `get-checkpoint-diff` | Renderer → Main | Returns the file diff for a specific checkpoint |
| `get-tool-calls` | Renderer → Main | Returns tool call log for a checkpoint |
| `get-session-summary` | Renderer → Main | Returns the final session summary text |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.copilot/session-state/` | Copilot CLI session state root (read-only) |
| `~/.copilot/session-state/<id>/checkpoints/` | Per-session checkpoint files |
| `~/.copilot/session-state/<id>/checkpoints/index.md` | Checkpoint index with titles |
