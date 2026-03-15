---
layout: default
title: Tech Workbench
parent: RobOS App Suite
nav_order: 10
---

# Tech Workbench

> AI-assisted technical spike and TPS (Technical Problem Solving) session workspace.

---

## Overview

Tech Workbench provides a structured environment for technical investigations, proof-of-concept work, and architecture explorations. Each session is a named workspace containing notes (Monaco editor), a file tree, AI chat, and an output log. Sessions are persisted locally and can be linked to Jira tickets or GitHub issues.

---

## Features

- Named TPS sessions with creation timestamp and status (open / complete / archived)
- Monaco-powered notes editor with Markdown rendering
- AI chat panel using context from the session notes and attached files
- File tree rooted at the session directory — drag files in or create new ones
- Link a session to a Jira ticket or GitHub issue
- Trash and restore sessions
- Journal event emission on session completion (feeds into [Work Journal](work-journal))
- Search-index integration — session notes are indexed for `@`-search in AI textareas

---

## How to Open

```bash
/usr/local/share/robos/tech-workbench/launch.sh
```

---

## Usage

### Creating a session

1. Click **+ New Session**.
2. Enter a name (becomes the folder name slug).
3. Click **Create**. A new session directory is initialised under the TPS root.

### Working in a session

- Write notes in the left Monaco pane. Notes auto-save.
- Attach files by dragging into the file tree.
- Use the AI chat panel to ask questions — it has full context of the notes and attached files.

### Completing a session

Click **Mark Complete**. The session status changes to **complete** and a journal event is emitted describing the session outcome.

### Archiving and trash

Click **🗑 Trash** to move a session to `.trash/` within the TPS root. Sessions in trash are excluded from search. Click **Restore** in the trash view to recover a session.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `tps_root` | Root directory for TPS sessions (default: `~/.config/robos/tech-workbench`) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-sessions` | Renderer → Main | Returns all non-trashed sessions |
| `create-session` | Renderer → Main | Creates a new TPS session directory and metadata |
| `update-session` | Renderer → Main | Updates notes or status for a session |
| `trash-session` | Renderer → Main | Moves a session to `.trash/` |
| `restore-session` | Renderer → Main | Moves a session out of `.trash/` |
| `ai-chat` | Renderer → Main | Sends a message to the AI with session context; streams response |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/tech-workbench/sessions.json` | Session index (name, slug, status, created, linked issue) |
| `~/.config/robos/tech-workbench/<slug>/notes.md` | Session notes (Markdown) |
| `~/.config/robos/tech-workbench/<slug>/` | Session file workspace |
| `~/.config/robos/tech-workbench/.trash/` | Trashed sessions |
| `~/.config/robos/journal-events.json` | Journal events written on session completion |
