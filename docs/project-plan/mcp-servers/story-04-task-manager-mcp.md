---
nav_exclude: true
---

# Story: Task Manager MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 3  

## Description

MCP server exposing task management operations to AI agents.

Tools:
- `robos_tasks_list` — List tasks with filters (assignee, status, epic, release)
- `robos_tasks_get` — Get task details by ID
- `robos_tasks_create` — Create a new task (story, bug, etc.)
- `robos_tasks_update` — Update task fields (status, assignee, priority)
- `robos_tasks_advance_workflow` — Advance task to next workflow stage
- `robos_tasks_add_comment` — Add a comment to a task
- `robos_tasks_log_hours` — Log work hours

Resources:
- `robos://task-manager/tasks/active` — Currently active task for this session
- `robos://task-manager/tasks/{id}` — Task details
- `robos://task-manager/tasks/{id}/comments` — Task comment thread

## Acceptance Criteria

- [x] AI agent can list, create, update tasks via MCP
- [x] Workflow stage advancement works correctly
- [x] Task server (Jira/GitHub) synced on changes
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/task-manager-mcp.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/task-manager-mcp/`.
