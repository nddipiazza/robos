---
layout: default
title: Search Index
parent: RobOS App Suite
nav_order: 26
---

# Search Index

> Background file system indexer that powers the `@`-file search in AI textarea fields across the RobOS app suite.

---

## Overview

Search Index is a background service that maintains a searchable index of files on the developer's machine. The primary consumer is the AI textarea component used in multiple RobOS apps — when a user types `@filename`, a fuzzy autocomplete dropdown draws from this index. The indexer covers configurable root directories (code repos, home folder) and updates incrementally when files change.

---

## Features

- Indexes file paths from configurable scan roots
- Incremental updates via `fs.watch` — new and deleted files are reflected within seconds
- Fuzzy search: `@my-comp` matches `MyComponent.tsx`, `my-component.js`, etc.
- Filters out `node_modules/`, `.git/`, build artefacts
- Lightweight SQLite database for fast prefix and fuzzy lookups
- Used by the shared AI textarea component in [Tech Workbench](tech-workbench), [Work Journal](work-journal), [Git Projects](git-projects), and others
- Exposes results via IPC; no renderer-level file system access required

---

## How to Start

Search Index starts automatically at login:

```bash
~/.config/autostart/robos-search-index.desktop
```

To start manually:

```bash
/usr/local/share/robos/search-index/launch.sh
```

---

## Usage

Search Index has no interactive UI of its own. It runs silently in the background. Other apps consume it via IPC:

```js
// In any renderer using the shared AI textarea:
const results = await window.robos.searchIndex('@MyComp');
// returns: [{ path: '/home/user/source/app/src/MyComponent.tsx', score: 0.95 }, ...]
```

The shared AI textarea component automatically queries Search Index when the user types `@` and renders a dropdown of matching file paths.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `search_index_roots` | Array of directories to index (default: `["~/source", "~/.config/robos"]`) |
| `search_index_exclude` | Glob patterns to exclude (default: `["**/node_modules/**", "**/.git/**"]`) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `search-files` | Renderer → Main | Returns top-N fuzzy matches for a query string |
| `reindex` | Renderer → Main | Triggers a full re-scan of all configured roots |
| `get-index-stats` | Renderer → Main | Returns `{ fileCount, lastIndexed, roots }` |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/search-index/index.db` | SQLite file index database |
| `~/.config/robos/settings.json` | `search_index_roots` and `search_index_exclude` config |
