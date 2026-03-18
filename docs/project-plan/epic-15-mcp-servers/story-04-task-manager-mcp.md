# Story 15-04: Task Manager MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
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
- `robos://tasks/active` — Currently active task for this session
- `robos://tasks/{id}` — Task details
- `robos://tasks/{id}/comments` — Task comment thread

## Acceptance Criteria

- [ ] AI agent can list, create, update tasks via MCP
- [ ] Workflow stage advancement works correctly
- [ ] Task server (Jira/GitHub) synced on changes
