---
nav_exclude: true
---

# Story: Dev Tools MCP Server (install/check tools)

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 2  

## Description

MCP server exposing Dev Tools install/check capabilities to AI agents. When an agent needs a tool that isn't installed, it can install it via MCP.

Tools:
- `robos_devtools_list` — List all available tools with install status
- `robos_devtools_check` — Check if a specific tool is installed
- `robos_devtools_install` — Install a tool by ID
- `robos_devtools_uninstall` — Uninstall a tool by ID

Resources:
- `robos://dev-tools-mcp/devtools/installed` — List of currently installed tools
- `robos://dev-tools-mcp/devtools/available` — Full tool catalog

## Acceptance Criteria

- [x] AI agent can check if Docker is installed and install it if not
- [x] Install progress streamed back to agent
- [x] Tool registry matches Dev Tools app exactly
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/dev-tools-mcp.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/dev-tools-mcp/`.
