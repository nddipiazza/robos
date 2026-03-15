---
layout: default
title: Context Manager
parent: RobOS App Suite
nav_order: 9
---

# Context Manager

> Curate the corpus of context sources that AI agents use when generating code, explanations, and plans.

---

## Overview

Context Manager lets you define, organise, and prioritise the information sources that feed into AI agent prompts. Sources can be files, directories, URLs, GitHub repositories, or journal events. When an agent runs, it reads the active context sources and includes their content in the prompt context window.

---

## Features

- Add context sources: local file/directory, URL, GitHub repo, or journal-event stream
- Enable or disable individual sources without deleting them
- Set priority order — higher-priority sources are included first when the context window is limited
- Preview the content of any source inline
- Tag sources by project or topic for selective agent use
- Journal events integration — recent entries from [Work Journal](work-journal) feed in as temporal context

---

## How to Open

```bash
/usr/local/share/robos/context-manager/launch.sh
```

---

## Usage

### Adding a source

1. Click **+ Add Source**.
2. Choose the source type (File, Directory, URL, GitHub Repo, Journal Events).
3. Fill in the path or URL and an optional label.
4. Click **Save**. The source appears in the list.

### Enabling / disabling

Toggle the switch on any source row. Disabled sources are skipped by agents but remain saved.

### Setting priority

Drag rows to reorder, or use the **▲ / ▼** buttons. Priority order determines inclusion order when context is trimmed to fit the model's context window.

### Previewing

Click **👁 Preview** on any source to see the current content that would be injected into a prompt.

---

## Configuration

No separate config file — all source definitions are stored in `context-sources.json`.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-context-sources` | Renderer → Main | Returns all defined context sources |
| `add-context-source` | Renderer → Main | Adds a new source entry |
| `update-context-source` | Renderer → Main | Updates label, enabled state, or priority |
| `delete-context-source` | Renderer → Main | Removes a source |
| `preview-context-source` | Renderer → Main | Returns resolved content for a source |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/context-sources.json` | All context source definitions |
| `~/.config/robos/journal-events.json` | Journal events consumed as a context source |
