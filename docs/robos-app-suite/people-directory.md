---
layout: default
title: People Directory
parent: RobOS App Suite
nav_order: 15
---

# People Directory

> Team member directory linked to GitHub profiles, with contact info and availability status.

---

## Overview

People Directory is the team's phonebook inside RobOS. It lists team members, their GitHub usernames, roles, and contact details. Profiles are enriched with live GitHub data (avatar, recent activity, open PRs). The directory integrates with the Notification Bus for `COLLABORATOR_JOINED` events when a teammate joins your ticket workspace.

---

## Features

- List and search all team members
- Profile cards with GitHub avatar, username, role, and email
- Live GitHub enrichment — recent commits, open PRs, and review assignments
- Add, edit, and remove team members
- Linked to the `people/` directory in the RobOS config for local profile storage
- Used by [Agents Manager](agents-manager) for `@mention` lookup in AI prompts

---

## How to Open

```bash
/usr/local/share/robos/people-directory/launch.sh
```

---

## Usage

### Browsing the directory

The main view shows all team members as cards. Use the search bar to filter by name, username, or role.

### Viewing a profile

Click a card to open the detail panel. GitHub data (avatar, pinned repos, open PRs) loads asynchronously.

### Adding a team member

1. Click **+ Add Person**.
2. Enter name, GitHub username, email, and role.
3. Click **Save**. A profile JSON is created in `~/.config/robos/people/`.

### Editing / removing

Open a profile and click **✏ Edit** or **🗑 Remove**.

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `github_token` | Used for enriching profiles with live GitHub data |

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-people` | Renderer → Main | Returns all team member profiles |
| `add-person` | Renderer → Main | Creates a new profile JSON |
| `update-person` | Renderer → Main | Updates an existing profile |
| `delete-person` | Renderer → Main | Removes a profile |
| `get-github-profile` | Renderer → Main | Fetches live GitHub data for a username |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/people/<uid>.json` | Individual profile files |
| `~/.config/robos/settings.json` | `github_token` for live enrichment |
