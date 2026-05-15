---
nav_exclude: true
---

# Epic 15: First-Class MCP Server Support

**Status:** Not started
**Priority:** Critical
**Dependencies:** Epic 02 (App Framework)

RobOS is AI-first, so every major system exposes a Model Context Protocol (MCP) server. When an AI agent (Claude Code, Copilot, etc.) works inside RobOS, it automatically has access to structured tools and resources for tasks, workspaces, knowledge, CI, and more — without custom integration per agent.

## Why This Is Critical

Without MCP, AI agents are blind. They can read files and run commands, but they can't:
- Query the task server for ticket context
- Browse the EKGraph for company knowledge
- Check CI status or deployment state
- Open files in the IDE at specific lines
- Read notification history or workspace state

With MCP, any AI agent that supports the protocol gets all of this for free. Claude Code, Copilot, and future agents all benefit immediately.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  AI Agent (Claude Code / Copilot / Custom)      │
│  ↕ MCP Protocol                                 │
├─────────────────────────────────────────────────┤
│  RobOS MCP Router (discovers + multiplexes)     │
├──────┬──────┬──────┬──────┬──────┬──────────────┤
│ Task │ Work │ EK   │ CI   │ IDE  │ System       │
│ Mgr  │ space│ Graph│ Mon  │Bridge│ (prefs,notif)│
│ MCP  │ MCP  │ MCP  │ MCP  │ MCP  │ MCP          │
└──────┴──────┴──────┴──────┴──────┴──────────────┘
```

Each RobOS app that has useful data/actions registers an MCP server. The MCP Router discovers all registered servers and exposes them as a single unified MCP endpoint that AI agents connect to.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [robos-mcp-lib — shared MCP server framework](story-01-robos-mcp-lib.md) | Not started | 5 |
| 02 | [MCP Server Manager app — discover, configure, test](story-02-mcp-server-manager.md) | Not started | 5 |
| 03 | [MCP Router — unified endpoint multiplexing all servers](story-03-mcp-router.md) | Not started | 5 |
| 04 | [Task Manager MCP server](story-04-task-manager-mcp.md) | Not started | 3 |
| 05 | [Workspace Manager MCP server](story-05-workspace-mcp.md) | Not started | 3 |
| 06 | [EKGraph MCP server](story-06-ekgraph-mcp.md) | Not started | 3 |
| 07 | [CI Monitor MCP server](story-07-ci-monitor-mcp.md) | Not started | 3 |
| 08 | [IDE Bridge MCP server](story-08-ide-bridge-mcp.md) | Not started | 3 |
| 09 | [System MCP server (prefs, notifications, search)](story-09-system-mcp.md) | Not started | 3 |
| 10 | [Claude Code auto-configuration (CLAUDE.md + mcp_servers)](story-10-claude-code-autoconfig.md) | Not started | 3 |
| 11 | [Dev Tools MCP server (install/check tools)](story-11-dev-tools-mcp.md) | Not started | 2 |
