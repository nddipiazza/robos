---
nav_exclude: true
---

# Story 15-05: Workspace Manager MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 3

## Description

MCP server exposing workspace operations to AI agents.

Tools:
- `robos_workspace_create` — Provision workspace for a task
- `robos_workspace_list` — List all workspaces
- `robos_workspace_get_active` — Get currently active workspace
- `robos_workspace_open_in_ide` — Open workspace in IDE
- `robos_workspace_run_setup` — Run dev environment setup
- `robos_workspace_start_devserver` — Start development servers

Resources:
- `robos://workspace/active` — Active workspace details (branch, repo, status)
- `robos://workspace/{id}/devserver` — Dev server status and URLs

## Acceptance Criteria

- [ ] AI agent can provision and manage workspaces via MCP
- [ ] IDE opens correctly when requested
- [ ] Dev server start/stop works
