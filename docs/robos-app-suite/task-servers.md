---
layout: default
title: Task Servers
parent: RobOS App Suite
nav_order: 24
---

# Task Servers

> Configure Jira and GitHub connections used as task server backends across all RobOS apps.

---

## Overview

Task Servers manages the connection profiles for external task-tracking and source-control systems. It provides a UI to add, test, and set the active Jira project and GitHub organisation that all other RobOS apps will use when fetching issues, PRs, and sprint data. Think of it as a connection manager for the SDLC integrations.

---

## Features

- Add and manage multiple Jira server profiles (Cloud or Data Center)
- Add and manage GitHub connection profiles (different orgs or GitHub Enterprise instances)
- Test each connection before saving
- Set the **active** Jira project and GitHub org used by all apps
- View current sprint, open PRs, and repository count for the active connections
- Credentials stored in `settings.json`; never logged or transmitted beyond the target API

---

## How to Open

```bash
/usr/local/share/robos/task-servers/launch.sh
```

---

## Usage

### Adding a Jira connection

1. Click **+ Add Jira**.
2. Enter the Jira Cloud base URL, email, and API token.
3. Click **Test Connection**. A project list loads on success.
4. Select the default project from the list.
5. Click **Save & Set Active**.

### Adding a GitHub connection

1. Click **+ Add GitHub**.
2. Enter the GitHub base URL (default: `https://api.github.com`) and a personal access token.
3. Click **Test Connection**.
4. Choose the default organisation from the org list.
5. Click **Save & Set Active**.

### Switching active connections

Click **Set Active** on any saved profile. All apps pick up the new active connection on their next data load.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `jira_base_url` | Active Jira base URL |
| `jira_email` | Active Jira email |
| `jira_api_token` | Active Jira API token |
| `jira_project_key` | Default Jira project key |
| `github_token` | Active GitHub personal access token |
| `github_org` | Active GitHub organisation |

All in `~/.config/robos/settings.json`.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-task-servers` | Renderer → Main | Returns all saved connection profiles |
| `add-task-server` | Renderer → Main | Saves a new connection profile |
| `test-task-server` | Renderer → Main | Tests a connection; returns `{ ok, details?, error? }` |
| `set-active-server` | Renderer → Main | Writes the active connection to `settings.json` |
| `delete-task-server` | Renderer → Main | Removes a saved profile |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | Active connection credentials read by all apps |
