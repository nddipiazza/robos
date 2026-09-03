---
nav_exclude: true
---

# Story: System MCP Server (Prefs, Notifications, Search)

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
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
- `robos://system-mcp/system/preferences` — Current settings
- `robos://system-mcp/system/notifications/recent` — Recent notifications
- `robos://system-mcp/system/tools` — Installed tool inventory

## Acceptance Criteria

- [x] AI agent can query system state
- [x] Agent can send notifications to the developer
- [x] File search works for @-mentions
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/system-mcp.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/system-mcp/`.
