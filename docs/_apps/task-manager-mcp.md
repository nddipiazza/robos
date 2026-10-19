---
title: "Task Manager MCP Server"
package: task-manager-mcp
category: services
summary: "MCP server with seven tools for listing, creating and advancing tasks stored in ~/.config/robos/tasks/tasks.json."
description: "Built on the MCP framework. Tasks are a local JSON file seeded with three sample tasks; it is not connected to Jira, GitHub or Linear."
icon: task-manager-mcp.svg
---

Task Manager MCP gives an agent a simple local task list. Tasks live in `~/.config/robos/tasks/tasks.json`. On first run the file is created with three sample tasks (`TASK-101` to `TASK-103`).

## Tools

| Tool | What it does |
|---|---|
| `robos_tasks_list` | List tasks, optionally filtered by `status`, `assignee` or `epic`. |
| `robos_tasks_get` | Return one task by id, or an error if it does not exist. |
| `robos_tasks_create` | Create a task (`title`, `priority`, `type`, `assignee`). Without an id it generates one like `TASK-123`. |
| `robos_tasks_update` | Merge fields into a task. |
| `robos_tasks_advance_workflow` | Move a task along `TODO`, `IN_PROGRESS`, `REVIEW`, `DONE`. |
| `robos_tasks_add_comment` | Add a timestamped comment. |
| `robos_tasks_log_hours` | Add to the task's logged hours. |

Resources: `robos://task-manager/tasks/active` (in-progress tasks) and `robos://task-manager/tasks/all`.

## The console window

**Task Manager MCP Server Console** shows task counts per status, **+ Create MCP Task** and **Advance Active Workflow** buttons, and a protocol trace of the calls. The server is created without an HTTP port, so it only registers itself in `~/.config/robos/mcp/servers.json`. The [MCP Router]({{ '/apps/robos-mcp-router/' | relative_url }}) has its own implementation of the same tool names that works on the same `tasks.json` file.

Run it with `npm start` in `packages/task-manager-mcp`; there is no `.desktop` launcher. `npm test` runs `node --test`. To connect Jira, GitHub or Linear to RobOS, see [Task Servers]({{ '/apps/task-servers/' | relative_url }}).
