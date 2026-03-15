---
layout: default
title: File Explorer
parent: RobOS App Suite
nav_order: 20
---

# File Explorer

> Dark-themed file browser with single-instance navigation and cross-app deep-linking.

---

## Overview

File Explorer is RobOS's built-in file manager. It provides a dark-themed directory browser with breadcrumb navigation, file operations (copy, move, delete, rename), and a terminal quick-open. Its killer feature is **mailbox-based navigation**: other RobOS apps can write a path to a mailbox file and File Explorer will navigate there instantly — even if it is already open — without spawning a second instance.

---

## Features

- Dark-themed directory tree and file list
- Breadcrumb navigation bar
- File operations: copy, move, delete, rename, new folder, new file
- Open files with the system default application (`xdg-open`)
- **Single-instance** — a second launch request focuses the existing window and navigates to the requested path
- **Mailbox navigation** — other apps write `~/.config/robos/file-explorer-nav.json`; File Explorer watches this file via `fs.watch` and navigates immediately
- Open a terminal in the current directory
- Show/hide hidden files toggle

---

## How to Open

```bash
/usr/local/share/robos/file-explorer/launch.sh [optional-path]
```

Or from any app that supports "Show in Explorer" — those apps write the mailbox file and re-invoke the launch script.

---

## Usage

### Navigating

Click directories in the file list or use the breadcrumb bar. The back/forward buttons navigate the history stack.

### File operations

Right-click any file or directory for a context menu with Copy, Move, Rename, Delete, and Properties options.

### Opening a file

Double-click any file. It opens with the system default application via `xdg-open`.

### Opening a terminal here

Click **Terminal** in the toolbar. A gnome-terminal opens with `cwd` set to the current directory.

### Navigating from another app

Other RobOS apps deep-link into File Explorer by writing:

```json
{ "path": "/home/user/source/my-project" }
```

to `~/.config/robos/file-explorer-nav.json`. File Explorer watches this file and navigates to the specified path within ~150 ms.

---

## Configuration

No dedicated config keys. File Explorer respects the XDG defaults for file associations.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `list-directory` | Renderer → Main | Returns directory contents for a path |
| `file-operation` | Renderer → Main | Performs copy/move/rename/delete/mkdir |
| `open-file` | Renderer → Main | Opens a file with `xdg-open` |
| `open-terminal-here` | Renderer → Main | Spawns gnome-terminal at the given path |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/file-explorer-nav.json` | Mailbox file — written by other apps to trigger navigation |
