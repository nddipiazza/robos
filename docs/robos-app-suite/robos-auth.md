---
layout: default
title: Auth Manager
parent: RobOS App Suite
nav_order: 19
---

# Auth Manager

> OAuth provider configuration and identity management for all RobOS integrations.

---

## Overview

Auth Manager centralises OAuth provider setup for the services RobOS integrates with — GitHub, Google (Calendar), Microsoft (Outlook/Exchange), Jira, and Slack. It stores provider configurations, manages the current user identity, and will host OAuth flow initiation once full token exchange is implemented. Until then, API tokens and the `myProfileUid` identity are managed here.

---

## Features

- List and manage OAuth provider configurations (GitHub, Google, Microsoft, Jira, Slack)
- Set the current user identity (`myProfileUid`) used across all apps
- Add, edit, and remove provider entries
- Display provider status (configured / not configured)
- Reads and writes the people directory to link identity to a team profile
- Foundation for future full OAuth PKCE flows per provider

---

## How to Open

```bash
/usr/local/share/robos/robos-auth/launch.sh
```

---

## Usage

### Setting your identity

1. Open **Auth Manager**.
2. In the **Identity** section, enter your RobOS user ID (typically your GitHub username).
3. Click **Save Identity**. The `myProfileUid` key is written to `settings.json`.

### Configuring a provider

1. Click on a provider card (e.g. **GitHub**).
2. Enter the required credentials (API token, client ID/secret for OAuth providers).
3. Click **Save**. The provider entry is stored in `providers.json`.

### Viewing provider status

Each provider card shows a status badge:
- ✅ **Configured** — credentials are present
- ⚠️ **Incomplete** — some required fields are missing
- ❌ **Not configured** — no entry exists

---

## Configuration

| Setting key | Description |
|-------------|-------------|
| `myProfileUid` | Current user's RobOS identity (stored in `settings.json`) |

Provider credentials are stored separately in `auth/providers.json`.

---

## IPC Reference

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-providers` | Renderer → Main | Returns all configured provider entries |
| `save-provider` | Renderer → Main | Creates or updates a provider entry |
| `delete-provider` | Renderer → Main | Removes a provider entry |
| `get-identity` | Renderer → Main | Returns `{ myProfileUid }` from settings |
| `save-identity` | Renderer → Main | Writes `myProfileUid` to settings |

---

## Data & Files

| Path | Description |
|------|-------------|
| `~/.config/robos/auth/providers.json` | OAuth provider configurations |
| `~/.config/robos/settings.json` | `myProfileUid` and general settings |
| `~/.config/robos/people/` | People directory (linked to identity) |
