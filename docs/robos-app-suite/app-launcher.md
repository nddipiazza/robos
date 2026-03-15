---
layout: default
title: App Launcher
parent: RobOS App Suite
nav_order: 1
---

# App Launcher

> Searchable icon grid that opens any RobOS application with a single click.

---

## Overview

App Launcher is the central entry point to the RobOS desktop. It provides a keyboard-driven, searchable grid of every installed RobOS application, styled consistently with the dark-theme desktop shell. It is bound to the tint2 panel and can be opened from anywhere with its keyboard shortcut.

---

## Features

- Instant fuzzy search filtering of all registered apps
- Icon grid layout with app name labels
- Single-click launch — apps open in their own window
- Dynamically reads the application registry so newly installed apps appear automatically

---

## How to Open

Click the **⊞** icon in the tint2 panel, or run:

```bash
/usr/local/share/robos/app-launcher/launch.sh
```

---

## Usage

1. The grid appears with all registered applications.
2. Type to filter — the grid narrows in real time.
3. Click any app icon to launch it.
4. Press **Escape** to close.

---

## Configuration

| File | Purpose |
|------|---------|
| `~/.config/robos/settings.json` | Read for theme/locale preferences |

App entries are sourced from the application registry managed by [RobOS Applications](robos-applications).

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-apps` | Renderer → Main | Returns array of registered app entries `[{ name, icon, launch }]` |
| `launch-app` | Renderer → Main | Executes the launch script for a given app key |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | User preferences (theme, locale) |
| `/usr/local/share/robos/*/launch.sh` | Per-app launch scripts discovered at runtime |
