---
nav_exclude: true
---

# Story 15-03: MCP Router — Unified Endpoint

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 5

## Description

A single MCP endpoint that multiplexes all registered RobOS MCP servers. AI agents connect to one place and get access to all RobOS tools and resources. The router discovers servers via a registry file, proxies tool calls to the right server, and merges resource listings.

Features:
- Single stdio or HTTP endpoint for AI agents
- Server discovery via registry at ~/.config/robos/mcp-registry.json
- Tool call routing: `robos_tasks_list` → Task Manager MCP server
- Resource listing merges all servers' resources
- Connection health monitoring with auto-reconnect
- Tool/resource filtering based on agent configuration
- Generates claude_desktop_config.json / .claude/settings.json MCP entries automatically

## Acceptance Criteria

- [ ] Single `robos-mcp-router` process serves all MCP tools
- [ ] Claude Code can connect and see all tools from all servers
- [ ] Adding a new MCP server to an app automatically appears in the router
- [ ] Failed servers don't crash the router (graceful degradation)
