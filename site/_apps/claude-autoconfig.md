---
title: "Claude Autoconfig"
package: claude-autoconfig
category: "libraries"
component_type: component
permalink: /claude-autoconfig/
redirect_from:
  - /apps/claude-autoconfig/
summary: "Generates Claude Code MCP router settings (`~/.claude/settings.json`) and workspace `CLAUDE.md` context files."
description: "Configuration helper in packages/claude-autoconfig (autoconfig.js) that wires Claude Code to the RobOS MCP Router and injects active task and KGraph context into CLAUDE.md."
related:
  - /agent-autoconfig/
  - /agents-manager/
  - /mcp-manager/
---

`packages/claude-autoconfig` (`autoconfig.js`) generates the local configuration files that connect Claude Code to the RobOS Model Context Protocol router and active workspace context.

## What `autoconfig.js` generates

- **`generateClaudeSettings(options)`**: Builds the `~/.claude/settings.json` `mcpServers.robos` entry pointing to `/usr/local/share/robos/robos-mcp-router/cli.js --stdio` with `ROBOS_ENV=desktop` so `robos_tasks_*`, `robos_workspace_*`, `robos_ekgraph_*`, `robos_ci_*`, and `robos_ide_*` tools are available automatically.
- **`generateProjectClaudeMd(options)`**: Renders a workspace `CLAUDE.md` summary injecting the active ticket (`id`, `title`, `stage`, `branch`, `repo`) and Knowledge Graph service topology (`services`, `environments`, `architectureNodes`).

Note: `package.json` still lists a legacy Electron `main.js` entry that is absent; import `autoconfig.js` directly from Node or manage interactive sessions through [Agent Autoconfig](/agent-autoconfig/), [Agent Chat](/agent-chat/), and [Agents Manager](/agents-manager/).

```bash
cd packages/claude-autoconfig
npm test
```

Source: [`packages/claude-autoconfig`](https://github.com/nddipiazza/robos/tree/main/packages/claude-autoconfig).
