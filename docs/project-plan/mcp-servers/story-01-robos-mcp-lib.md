---
nav_exclude: true
---

# Story: robos-mcp-lib — Shared MCP Server Framework

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

Create `packages/robos-mcp-lib/` — a shared library that makes it trivial for any RobOS app to expose an MCP server. Wraps the MCP protocol specification with RobOS conventions: standard tool naming (`robos_<app>_<action>`), resource URI scheme (`robos://<app>/<resource>`), and automatic server registration with the MCP Router.

## Acceptance Criteria

- [x] Any RobOS app can expose an MCP server in <20 lines of code
- [x] Tools follow naming convention: `robos_<app>_<action>`
- [x] Resources follow URI scheme: `robos://<app>/<type>/<id>`
- [x] Server registers with MCP Router on startup (`~/.config/robos/mcp/servers.json`)
- [x] Works with both Claude Code (stdio) and HTTP clients
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/mcp-lib.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/robos-mcp-lib/`.
