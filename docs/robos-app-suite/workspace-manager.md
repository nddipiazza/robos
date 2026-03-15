---
layout: default
title: Workspace Manager
parent: RobOS App Suite
nav_order: 6
---

# Workspace Manager

> Scan local directories for code workspaces and open them instantly in any installed IDE.

---

## Overview

Workspace Manager discovers all code workspaces on the developer's machine — Git repositories, IDE project files, and registered RobOS projects — and presents them in a searchable list. Any workspace can be opened in a chosen IDE with a single click.

---

## Features

- Recursive directory scan for `.git` folders, `.idea` project files, and VS Code workspaces
- Integrates with [IDE Manager](ide-manager) to enumerate available IDEs
- One-click open in IntelliJ, VS Code, Cursor, or terminal
- Pin frequently used workspaces to the top of the list
- Search / filter by path or project name
- Shows last-modified date for each workspace

---

## How to Open

```bash
/usr/local/share/robos/workspace-manager/launch.sh
```

---

## Usage

### Scanning for workspaces

1. Open the app. It performs an initial scan of `~/source/` (configurable).
2. Click **↻ Rescan** to refresh the list.
3. Use the search bar to filter by project name or path.

### Opening a workspace

Click the IDE button next to a workspace row. Available IDEs are determined at runtime from [IDE Manager](ide-manager).

### Pinning

Click the **☆** icon on any row to pin it. Pinned workspaces appear at the top regardless of sort order.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `workspace_scan_roots` | Array of directories to scan (default `["~/source"]`) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `scan-workspaces` | Renderer → Main | Scans configured roots and returns workspace list |
| `open-workspace` | Renderer → Main | Opens a workspace path in the specified IDE |
| `pin-workspace` | Renderer → Main | Toggles pin state for a workspace |
| `get-installed-ides` | Renderer → Main | Forwards to IDE Manager; returns available IDEs |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | `workspace_scan_roots` config |
| `~/.config/robos/pinned-workspaces.json` | List of pinned workspace paths |
