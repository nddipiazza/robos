---
title: "Workspace Manager MCP Server"
package: workspace-manager-mcp
category: services
summary: "MCP server with six workspace tools, backed by a JSON file of sample workspaces. Several tools return canned results and do not run anything."
description: "Built on the MCP framework. It records workspaces in ~/.config/robos/workspaces/workspaces.json; it does not create git worktrees, open an IDE or start dev servers."
---

Workspace Manager MCP is a prototype of an agent-facing workspace API. It keeps a list of workspace records in `~/.config/robos/workspaces/workspaces.json`, created on first run with two sample entries (`robos-core` and `robos-auth-service`, with paths under `/home/ndipiazza/`).

## Tools

| Tool | Behavior today |
|---|---|
| `robos_workspace_create` | Adds a record for a task (name, branch, path, random dev-server port) and marks it active. It does not run `git worktree`. |
| `robos_workspace_list` | Returns all records. |
| `robos_workspace_get_active` | Returns the active record. |
| `robos_workspace_open_in_ide` | Returns a fixed "OPENED" result naming `http://localhost:63343/open-project`. It does not call the IDE. |
| `robos_workspace_run_setup` | Returns a fixed result listing `npm install --quiet` and `git submodule update --init` as executed. It runs nothing. |
| `robos_workspace_start_devserver` | Sets `running: true` and the port in the record. It does not start a server. |

Resources: `robos://workspace-manager/workspace/active` and `.../workspace/all`.

For discovering and switching real repositories, use [Workspace Manager]({{ '/apps/workspace-manager/' | relative_url }}).

## The console window

**Workspace Manager MCP Server Console** has **+ Provision Task Worktree** and **Open IDE Bridge** buttons, a workspace list and a protocol trace. The server is created without an HTTP port, so it only registers itself in `~/.config/robos/mcp/servers.json`. Run it with `npm start` in `packages/workspace-manager-mcp`. `npm test` runs `node --test`.
