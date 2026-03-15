---
layout: default
title: RobOS Preferences
parent: RobOS App Suite
nav_order: 17
---

# RobOS Preferences

> System-wide RobOS configuration — Jira credentials, GitHub token, AI settings, and UI preferences.

---

## Overview

RobOS Preferences is the single place to configure everything that crosses multiple apps: Jira connection, GitHub token, AI provider settings, default directories, theme, and notification preferences. All settings are persisted to `~/.config/robos/preferences.json` and read by every other RobOS app at startup.

---

## Features

- **Connections tab** — Jira Cloud URL, email, API token; GitHub personal access token
- **AI tab** — Copilot CLI path, model preference, context window limit
- **Directories tab** — workspace scan root, scripts storage root, journal repo
- **Notifications tab** — which notification types to enable, toast timeout durations
- **Theme tab** — accent colour, font size
- Live validation — tests Jira and GitHub credentials on Save
- Import / export settings as a JSON file for machine migration

---

## How to Open

```bash
/usr/local/share/robos/robos-preferences/launch.sh
```

Or navigate to **Preferences** from any app's hamburger menu.

---

## Usage

### Configuring Jira

1. Go to the **Connections** tab.
2. Enter your Jira Cloud base URL (e.g. `https://mycompany.atlassian.net`), email, and API token.
3. Click **Test Connection**. A green checkmark confirms success.
4. Click **Save**.

### Configuring GitHub

1. Go to the **Connections** tab.
2. Enter your GitHub personal access token (`repo`, `read:user` scopes required).
3. Click **Test Connection**.
4. Click **Save**.

### Exporting settings

Click **Export Settings**. A file picker opens. The current `preferences.json` is saved to the chosen location.

### Importing settings

Click **Import Settings** and choose a previously exported JSON file. Settings are merged (imported values override current values).

---

## Configuration

This app _is_ the configuration store. All settings are written to:

```
~/.config/robos/preferences.json
```

Other apps also read `~/.config/robos/settings.json`. Preferences writes both files to ensure compatibility.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-preferences` | Renderer → Main | Returns the full preferences object |
| `save-preferences` | Renderer → Main | Writes preferences and validates connections |
| `test-jira-connection` | Renderer → Main | Returns `{ ok, error? }` |
| `test-github-connection` | Renderer → Main | Returns `{ ok, login?, error? }` |
| `export-preferences` | Renderer → Main | Opens save dialog and writes JSON |
| `import-preferences` | Renderer → Main | Opens open dialog and merges JSON |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/preferences.json` | Primary preferences store |
| `~/.config/robos/settings.json` | Legacy/compat settings file (also written on save) |
