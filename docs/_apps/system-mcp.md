---
title: "System MCP Server"
package: system-mcp
category: services
summary: "MCP server with six tools for preferences, notifications, a tool inventory, file-name search and the active task, backed by a JSON file with sample data."
description: "Built on the MCP framework. It stores its state in ~/.config/robos/system/state.json and does not read live system data or the real toast daemon."
icon: system-mcp.svg
---

System MCP exposes a small set of "system" tools to an agent. The data comes from `~/.config/robos/system/state.json`, which is created with built-in sample values on first run and edited by the tools afterwards.

## Tools and resources

| Tool | Behavior |
|---|---|
| `robos_system_get_preferences` | Returns the `preferences` object in the state file (sample: theme, AI model, port values). It does not read `~/.config/robos/settings.json`. |
| `robos_system_send_notification` | Adds a notification (`title`, `body`, `urgency`) to the state file. It does not show a toast. |
| `robos_system_search_files` | Substring search over a fixed list of file names stored in the state file. It does not scan your disk. |
| `robos_system_get_installed_tools` | Returns the tool list in the state file (sample entries for gh, kubectl, docker, cargo). |
| `robos_system_install_tool` | Marks a tool as installed in the state file; nothing is installed. |
| `robos_system_get_active_task` | Returns the sample `activeTask` object. |

Resources: `robos://system-mcp/system/preferences`, `.../system/notifications/recent` and `.../system/tools`.

For real notifications use `robos-notify` from [RobOS CLI Tools]({{ '/apps/robos-cli/' | relative_url }}).

## The console window

**System MCP Server Console** has **@-Search Files** and **Send Toast Notification** buttons, panels for tools, preferences and recent notifications, and a protocol trace. The server is created without an HTTP port, so it only registers itself in `~/.config/robos/mcp/servers.json`; it does not listen on the network. Run it with `npm start` in `packages/system-mcp`. `npm test` runs `node --test`.
