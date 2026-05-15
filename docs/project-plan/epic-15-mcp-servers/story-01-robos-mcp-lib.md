---
nav_exclude: true
---

# Story 15-01: robos-mcp-lib — Shared MCP Server Framework

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 5

## Description

Create packages/robos-mcp-lib/ — a shared library that makes it trivial for any RobOS app to expose an MCP server. Wraps the MCP SDK with RobOS conventions: standard tool naming (`robos_<app>_<action>`), resource URI scheme (`robos://<app>/<resource>`), automatic server registration with the MCP Router.

Features:
- `createMCPServer(appId, tools, resources)` — one-call setup
- Standard tool response format with structured errors
- Resource templates for common patterns (list, get, search)
- Auto-register with MCP Router via Unix socket or HTTP
- Server health endpoint
- Supports both stdio (for Claude Code) and HTTP/SSE transports

## Acceptance Criteria

- [ ] Any RobOS app can expose an MCP server in <20 lines of code
- [ ] Tools follow naming convention: `robos_<app>_<action>`
- [ ] Resources follow URI scheme: `robos://<app>/<type>/<id>`
- [ ] Server registers with MCP Router on startup
- [ ] Works with both Claude Code (stdio) and HTTP clients
