---
layout: default
title: RobOS Applications
parent: RobOS App Suite
nav_order: 18
---

# RobOS Applications

> Software registry — add, manage, and launch application shortcuts on the RobOS desktop.

---

## Overview

RobOS Applications is the desktop software registry. It tracks installed applications (RobOS apps, system tools, and user-added shortcuts), provides a management UI for adding/removing entries, and is the source of truth that the [App Launcher](app-launcher) reads at runtime. Think of it as a GUI package registry for desktop app shortcuts.

---

## Features

- List all registered applications with name, icon, and launch command
- Add custom application shortcuts (any executable or `.desktop` entry)
- Remove shortcuts from the registry
- Edit an app's name, icon path, and launch command
- Export the registry to a portable JSON file
- Integrates with [App Launcher](app-launcher) — changes are reflected immediately
- Category tagging (Development, System, Utilities, etc.)

---

## How to Open

```bash
/usr/local/share/robos/robos-applications/launch.sh
```

---

## Usage

### Browsing registered apps

The main table lists all registered apps with name, category, launch command, and icon.

### Adding a shortcut

1. Click **+ Add Application**.
2. Enter:
   - **Name** — display name
   - **Launch command** — full path to executable or shell command
   - **Icon** — path to a PNG or SVG icon
   - **Category** — from the category dropdown
3. Click **Save**. The app appears in the registry and in [App Launcher](app-launcher) immediately.

### Editing

Click the **✏** icon on any row. Edit fields inline and click **Update**.

### Removing

Click the **🗑** icon on any row and confirm. The shortcut is removed from the registry.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `robos_apps_dir` | Base directory for installed RobOS apps (default: `/usr/local/share/robos`) |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-registered-apps` | Renderer → Main | Returns all registered app entries |
| `add-app` | Renderer → Main | Adds a new registry entry |
| `update-app` | Renderer → Main | Updates an existing entry |
| `delete-app` | Renderer → Main | Removes an entry from the registry |
| `export-registry` | Renderer → Main | Saves registry to a JSON file via save dialog |
| `import-registry` | Renderer → Main | Merges a JSON file into the current registry |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | `robos_apps_dir` and other system settings |
| `~/.config/robos/registered-apps.json` | The application registry (read by App Launcher) |
