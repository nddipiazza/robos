# Story 15-08: IDE Bridge MCP Server

**Epic:** [First-Class MCP Server Support](epic.md)
**Status:** Not started
**Points:** 3

## Description

MCP server that lets AI agents interact with the developer's IDE.

Tools:
- `robos_ide_open_file` — Open a file at a specific line/column
- `robos_ide_set_breakpoint` — Set a breakpoint at file:line
- `robos_ide_run_config` — Start a run/debug configuration
- `robos_ide_stop_config` — Stop a running configuration
- `robos_ide_navigate_to_symbol` — Navigate to a class/function by name
- `robos_ide_get_open_files` — List currently open files

Resources:
- `robos://ide/status` — IDE name, version, open project
- `robos://ide/open-files` — Currently open editor tabs

## Acceptance Criteria

- [ ] AI agent can open files, set breakpoints, start debug sessions
- [ ] Works with both JetBrains (port 63343) and VS Code (code CLI)
- [ ] Agent can set up reproduction environment hands-free
