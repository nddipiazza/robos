# Story 15-10: Claude Code Auto-Configuration

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 3

## Description

When Claude Code starts a session inside RobOS, automatically configure it to connect to the RobOS MCP Router. Generate the correct entries in .claude/settings.json and project-level CLAUDE.md.

Features:
- On RobOS login, generate ~/.claude/settings.json with MCP server config pointing to robos-mcp-router
- Include tool descriptions so Claude knows what's available
- Project-level CLAUDE.md gets instructions about available RobOS tools
- When active task changes, update CLAUDE.md with task context
- Auto-inject EKGraph context for the current repo

## Acceptance Criteria

- [ ] `claude` command inside RobOS automatically has all MCP tools available
- [ ] No manual MCP configuration needed
- [ ] Task context injected into every Claude session
- [ ] EKGraph context for the repo auto-loaded
