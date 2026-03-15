---
layout: default
title: Work Journal
parent: RobOS App Suite
nav_order: 11
---

# Work Journal

> Git-backed developer journal with AI-generated activity feed and daily reflection prompts.

---

## Overview

Work Journal provides a private, version-controlled journal for developers to record daily progress, decisions, and learnings. Journal entries are stored as Markdown files in a dedicated GitHub repository. An AI activity feed automatically summarises recent Jira transitions and GitHub commits, giving context for each journal entry.

---

## Features

- Daily entry creation with date-stamped Markdown files
- Git-backed storage in a configurable GitHub repository (auto-cloned on first use)
- AI activity feed — pulls the last 24 h of Jira transitions and GitHub commits as entry starters
- Rich Markdown editor (Monaco) with preview pane
- Tag entries with projects, moods, or custom labels
- Search across all entries
- Publishes `journal-events.json` consumed by [Tech Workbench](tech-workbench) and [Context Manager](context-manager)

---

## How to Open

```bash
/usr/local/share/robos/work-journal/launch.sh
```

---

## Usage

### Creating an entry

1. Click **+ New Entry** (or it is auto-created for today).
2. The AI activity feed loads in the right panel showing recent commits and Jira activity.
3. Write your entry in the Monaco editor.
4. Click **Save & Push** to commit and push to the journal repository.

### Browsing past entries

Use the calendar sidebar to navigate to any date. Entries load from the local clone.

### Searching

Use the search bar (Ctrl+F) to full-text search across all local journal entries.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `journal_repo` | GitHub URL of the journal repository (e.g. `https://github.com/user/journal`) |
| `jira_base_url` | Used to fetch recent Jira activity for the AI feed |
| `github_token` | Used to clone the journal repo and fetch commit activity |

All settings in `~/.config/robos/settings.json`.

The journal directory is derived from the `journal_repo` URL:
```
~/source/github.com/<user>/<repo>/
```

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-entry` | Renderer → Main | Reads or creates the journal entry for a given date |
| `save-entry` | Renderer → Main | Writes and git-commits the entry Markdown |
| `push-journal` | Renderer → Main | Pushes the journal repo to GitHub |
| `get-activity-feed` | Renderer → Main | Returns AI-summarised Jira + GitHub activity for the last 24 h |
| `search-entries` | Renderer → Main | Full-text search across all entry files |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | `journal_repo`, Jira, and GitHub config |
| `~/source/github.com/<user>/<repo>/YYYY-MM-DD.md` | Individual journal entry files |
| `~/.config/robos/journal-events.json` | Structured event feed consumed by other apps |
