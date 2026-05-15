---
nav_exclude: true
---

# Story 06-08: Multi-Agent CLI Support

**Epic:** [AI Agent Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

RobOS is agent-agnostic. Any AI agent CLI that supports MCP (or can be adapted) should be a first-class citizen. The AI Agent Manager supports multiple backends, and the MCP Router works with all of them.

Supported agent CLIs:
- **Claude Code** (`claude`) — Anthropic's CLI, native MCP support
- **GitHub Copilot CLI** (`gh copilot`) — GitHub's CLI assistant
- **OpenAI Codex CLI** (`codex`) — OpenAI's coding agent
- **Google Gemini CLI** (`gemini`) — Google's CLI agent
- **Aider** (`aider`) — Open-source AI coding assistant
- **Continue** — Open-source AI code assistant (VS Code/JetBrains)

For each supported agent:
- Auto-detect if installed (via Dev Tools checkCmd)
- Configure MCP connection (if supported) or context injection (if not)
- Agent session UI in AI Agent Manager shows unified view regardless of backend
- Task workflow stages work the same regardless of which agent is doing the work

Agents that support MCP get full integration automatically. Agents that don't support MCP get a compatibility layer:
- Context injected via project-level config files (CLAUDE.md equivalent)
- Tool calls translated to CLI commands
- Output parsed back into structured results

## Acceptance Criteria

- [ ] At least 3 agent CLIs configurable in AI Agent Manager
- [ ] MCP-capable agents get all RobOS tools automatically
- [ ] Non-MCP agents get context injection and basic tool support
- [ ] Agent selection is per-task (different tasks can use different agents)
- [ ] Unified session UI regardless of agent backend
