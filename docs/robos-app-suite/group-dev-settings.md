---
layout: default
title: Group Dev Settings
parent: RobOS App Suite
nav_order: 16
---

# Group Dev Settings

> Manage and synchronise shared development settings across a team group.

---

## Overview

Group Dev Settings lets teams define a canonical set of development configuration values — environment variables, tool versions, shared secrets references — that every developer on the team should have. Settings are stored in a shared GitHub repository and pulled into each developer's local environment via RobOS. This ensures consistent local dev environments without manual coordination.

---

## Features

- Define key-value settings grouped by category (Environment, Versions, Secrets)
- Sync settings from a shared GitHub repository
- Merge team settings with local overrides (local values win)
- Export settings as a `.env` file for use in dev servers
- Diff view showing what changed since last sync
- Integrates with [Git Projects](git-projects) — settings can be injected into dev-setup scripts

---

## How to Open

```bash
/usr/local/share/robos/group-dev-settings/launch.sh
```

---

## Usage

### Configuring the group settings repo

1. Open **RobOS Preferences** and set `group_settings_repo` to the shared GitHub URL.
2. Open Group Dev Settings — it clones the repo automatically on first use.

### Viewing settings

Settings are displayed in a table grouped by category. The **Source** column shows whether each value is from the team repo or a local override.

### Adding a local override

Click **+ Override** next to any team setting. Enter the local value. Overrides are stored locally and never pushed to the shared repo.

### Syncing

Click **↻ Sync** to pull the latest settings from the shared repo. A diff pane shows new/changed/removed keys.

### Exporting to `.env`

Click **Export .env** and choose a destination. All active settings (team + overrides) are written as `KEY=value` lines.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `group_settings_repo` | GitHub URL of the shared team settings repository |
| `github_token` | Token for cloning/pulling the settings repo |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-group-settings` | Renderer → Main | Returns merged team + local settings |
| `sync-group-settings` | Renderer → Main | Pulls latest from the shared repo; returns diff |
| `add-local-override` | Renderer → Main | Saves a local override for a key |
| `remove-local-override` | Renderer → Main | Removes a local override, reverting to team value |
| `export-dotenv` | Renderer → Main | Writes merged settings to a `.env` file |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | `group_settings_repo` and `github_token` |
| `~/.config/robos/group-dev-settings-overrides.json` | Local overrides (never committed) |
| `~/source/github.com/<org>/<settings-repo>/` | Cloned team settings repository |
