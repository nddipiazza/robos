---
layout: default
title: Dev Central
parent: RobOS App Suite
nav_order: 2
---

# Dev Central

> The developer's daily dashboard — sprint board, PR health, meeting agenda, and AI-generated standup summary in one window.

---

## Overview

Dev Central is the home screen for a developer's working day. It aggregates live data from Jira, GitHub, and the calendar into a single dark-themed dashboard. A Copilot-powered standup summary is generated on demand, pulling the last 24 hours of Jira transitions and GitHub activity.

---

## Features

- **Sprint board** — current sprint tickets in swim-lane view (Backlog → In Progress → Review → Done)
- **PR health panel** — all open PRs with review lag, approval status, and CI state
- **Meeting strip** — next three calendar events with one-click join links
- **AI standup** — generates a plain-English "what I did / doing / blockers" summary via Copilot CLI
- **Blocker radar** — tickets with active blockers surfaced with AI-suggested unblocking actions
- **Bi-daily PR digest** — emitted to the notification bus at 10:00 and 16:00

---

## How to Open

```bash
/usr/local/share/robos/dev-central/launch.sh
```

Or click the **Dev Central** icon in the tint2 panel.

---

## Usage

### Viewing your sprint

The sprint board auto-loads on open using the Jira credentials from `settings.json`. Drag tickets across columns to transition them.

### Generating a standup summary

Click **✨ Generate Standup**. The app invokes the Copilot CLI with your recent Jira/GitHub activity as context and streams the result into the summary panel.

### Joining a meeting

Click **Join** next to a calendar event in the meeting strip. The app launches the video link in the system browser.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `jira_base_url` | Jira Cloud base URL |
| `jira_email` | Jira login email |
| `jira_api_token` | Jira API token |
| `github_token` | GitHub personal access token |
| `sprint_board_id` | Jira board ID for the active sprint |

All settings live in `~/.config/robos/settings.json`.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-sprint-tickets` | Renderer → Main | Returns tickets in the current sprint |
| `transition-ticket` | Renderer → Main | Moves a ticket to a new Jira status |
| `get-open-prs` | Renderer → Main | Returns open PRs from GitHub |
| `get-calendar-events` | Renderer → Main | Returns next N calendar events |
| `generate-standup` | Renderer → Main | Streams AI standup summary |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/settings.json` | Jira, GitHub, calendar credentials |
| `~/.config/robos/notifications.json` | Notification bus (toast daemon reads this) |
