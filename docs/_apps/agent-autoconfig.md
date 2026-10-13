---
title: "Agent Autoconfig"
package: agent-autoconfig
category: services
summary: "Writes MCP configuration and instruction files so Claude Code, Gemini, Copilot and Cursor all point at the RobOS MCP router."
description: "Agent Autoconfig generates per-agent MCP config files in your home directory and an AGENTS.md plus pointer files in ~/workspace. The task and knowledge-graph context it injects is currently a fixed default."
---

Agent Autoconfig keeps the config files of several coding agents pointing at one MCP server entry, `robos`, which runs `robos-mcp-router/cli.js --stdio`. It also writes an `AGENTS.md` for the project.

## What it writes

The sync runs when the app starts and again when you click **Sync All Agent Configurations**. It overwrites these files:

| Agent | MCP config (under your home directory) | Instruction file (in `~/workspace`) |
|---|---|---|
| Universal standard | none | `AGENTS.md` |
| Claude Code | `.claude/settings.json` | `CLAUDE.md` |
| Gemini / Antigravity | `.gemini/antigravity/mcp/robos.json` | `GEMINI.md` |
| GitHub Copilot CLI | `.config/github-copilot/mcp.json` | `COPILOT.md` |
| Cursor / OpenAI Codex | `.cursor/mcp.json` | `CODEX.md` |

Each MCP entry runs `node /usr/local/share/robos/robos-mcp-router/cli.js --stdio` with `ROBOS_ENV=desktop` and `ROBOS_MCP_AUTO=true`. That path is where the router is installed in a RobOS VM, so the generated config only works where the router exists at that path.

{: .warning }
The sync replaces the whole contents of these files, including an existing `.claude/settings.json`. Back up any settings you want to keep before running the app.

## What you do in it

- Select an agent in the **Supported AI Coding Assistants & Standards** list to preview its generated MCP JSON and its instruction file.
- Click **Universal AGENTS.md** to preview the universal file.
- Click **Sync All Agent Configurations** to rewrite everything.

## Limits

The "Active Task Context" and "EKGraph Knowledge Context" sections of the generated `AGENTS.md` come from constants in `autoconfig.js` (task `TASK-101`, repo `nddipiazza/robos`, 142 architecture nodes). The app does not read your current task or knowledge graph yet. The `:19151` figure in the header is a static label.

Source: [`packages/agent-autoconfig`](https://github.com/nddipiazza/robos/tree/main/packages/agent-autoconfig). `npm test` runs `node --test` there.
