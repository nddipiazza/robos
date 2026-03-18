# Story 15-02: MCP Server Manager App

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 5

## Description

Electron app to discover, configure, and test MCP servers running in RobOS. Shows all registered servers with their tools and resources. Test tools interactively (fill in params, execute, see results). Enable/disable servers per agent session. Configure which servers are available to which AI agents.

Features:
- List all registered MCP servers with status (running/stopped/error)
- Browse tools and resources per server
- Interactive tool tester: select tool, fill params, execute, view result
- Resource browser: browse resources, view content
- Server logs viewer
- Configuration: which servers each AI agent can access
- Start/stop individual servers

## Acceptance Criteria

- [ ] Discovers all running MCP servers automatically
- [ ] Can test any tool interactively
- [ ] Can browse any resource
- [ ] Shows server health and logs
- [ ] Configuration persisted in ~/.config/robos/mcp-config.json
