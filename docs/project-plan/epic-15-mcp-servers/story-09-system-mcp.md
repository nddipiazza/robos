---
nav_exclude: true
---

# Story 15-09: System MCP Server (Prefs, Notifications, Search)

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 3

## Description

MCP server exposing RobOS system-level data and actions.

Tools:
- `robos_system_get_preferences` — Read RobOS preferences
- `robos_system_send_notification` — Send a toast notification
- `robos_system_search_files` — Search the file index
- `robos_system_get_installed_tools` — List installed dev tools
- `robos_system_install_tool` — Install a dev tool by ID
- `robos_system_get_active_task` — Get the currently active task

Resources:
- `robos://system/preferences` — Current settings
- `robos://system/notifications/recent` — Recent notifications
- `robos://system/tools` — Installed tool inventory

## Acceptance Criteria

- [ ] AI agent can query system state
- [ ] Agent can send notifications to the developer
- [ ] File search works for @-mentions
