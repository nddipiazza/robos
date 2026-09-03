---
nav_exclude: true
---

# Story: Universal AI Agent Auto-Configuration (CLAUDE.md, GEMINI.md, AGENTS.md + mcp_servers)

**Epic:** [First-Class MCP Server Support](epic.md)  
**Status:** Done  
**Points:** 3  

## Description

Universal AI agent configuration system provisioning MCP settings and context across all major AI coding agents (Claude Code, Gemini/Antigravity, GitHub Copilot, Cursor/Codex, and AGENTS.md).

Features:
- Auto-generate MCP server configuration connecting to `robos-mcp-router` (`--stdio`)
- Universal `AGENTS.md` instructions detailing all available RobOS MCP tool suites
- Synchronized pointer documents (`CLAUDE.md`, `GEMINI.md`, `COPILOT.md`, `CODEX.md`)
- Dynamic live injection of active task context (`TASK-101`)
- Auto-load EKGraph knowledge context for active repositories

## Acceptance Criteria

- [x] `claude`, `gemini`, `copilot`, and `cursor` commands automatically have all MCP tools available
- [x] No manual per-agent MCP configuration needed
- [x] Task context injected into every AI agent session
- [x] EKGraph context for the repo auto-loaded into `AGENTS.md`
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/mcp-servers/claude-autoconfig.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/claude-autoconfig/`.
