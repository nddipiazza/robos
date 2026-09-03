---
nav_exclude: true
---

# Story: MCP Server Manager App

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Electron app to discover, configure, and test MCP servers running in RobOS. Shows all registered servers with their tools and resources. Test tools interactively (fill in params, execute, see results). Enable/disable servers per agent session. Configure which servers are available to which AI agents.

## Acceptance Criteria

- [x] Discovers all running MCP servers automatically
- [x] Can test any tool interactively
- [x] Can browse any resource
- [x] Shows server health and logs
- [x] Configuration persisted in `~/.config/robos/mcp-config.json`
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/mcp-manager.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/mcp-manager/`.
