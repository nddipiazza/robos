---
nav_exclude: true
---

# Story: MCP Router — Unified Endpoint

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

A single MCP endpoint that multiplexes all registered RobOS MCP servers. AI agents connect to one place and get access to all RobOS tools and resources. The router discovers servers via a registry file, proxies tool calls to the right server, and merges resource listings.

## Acceptance Criteria

- [x] Single `robos-mcp-router` process serves all MCP tools
- [x] Claude Code can connect and see all tools from all servers
- [x] Adding a new MCP server to an app automatically appears in the router
- [x] Failed servers don't crash the router (graceful degradation)
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/mcp-router.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-mcp-router/`.
