---
title: "IDE Bridge MCP Server"
package: ide-bridge-mcp
category: services
summary: "An MCP server that forwards IDE commands (open file, breakpoints, run configurations, refactorings) to the RobOS IntelliJ plugin on port 63343."
description: "ide-bridge-mcp exposes 17 robos_ide_* tools. Each one updates a local state file and sends an HTTP request to the IntelliJ plugin; the plugin implements only some of the routes."
icon: ide-bridge-mcp.svg
---

IDE Bridge MCP lets an agent drive an IDE through the same MCP interface it uses for the rest of RobOS. The IDE side is the plugin in `plugins/intellij-idea` (Kotlin), which listens on `http://127.0.0.1:63343/robos/...`.

## How a call works

Each tool does two things. It updates a state file, `~/.config/robos/ide/state.json`, which starts with a sample IntelliJ IDEA session (a `HelloWorld.java`, one breakpoint, two run configurations and a suspended thread in `PetService.java`). Then it sends an HTTP request to the plugin and returns the plugin's answer as `ipcResult`.

{: .important }
Most tools return `ok: true` even when the plugin is not running, because `ok` reflects the local state update. Read `ipcResult.ok` to see whether the IDE actually received the command. `robos_ide_open_file` also runs `code -g <file>:<line>:<col>` for VS Code if it is installed.

## Tools

| Group | Tools |
|---|---|
| Files and navigation | `robos_ide_open_file`, `robos_ide_get_open_files`, `robos_ide_navigate_to_symbol` |
| Debugging | `robos_ide_set_breakpoint`, `robos_ide_register_breakpoint_webhook`, `robos_ide_get_thread_state` |
| Run configurations | `robos_ide_create_run_config`, `robos_ide_run_config`, `robos_ide_stop_config` |
| Workspaces | `robos_ide_create_ephemeral_workspace`, `robos_ide_destroy_workspace` |
| Refactoring | `robos_ide_refactor_rename`, `_extract_method`, `_extract_variable`, `_move`, `_safe_delete` |
| Other | `robos_ide_execute_action` |

Resources: `robos://ide-bridge-mcp/ide/status`, `.../ide/open-files` and `.../ide/thread-state`.

Secrets in run configurations are passed as `pass:<path>` references (the `passSecrets` argument adds the prefix), so the plain value is not written to the state file.

## What the plugin implements

The routes in `RobOSIpcServer.kt` are `health`, `open-file`, `set-breakpoint`, `run-config/create`, `run-config/run`, `run-config/stop`, `webhook/register`, `debug/thread-state`, `workspace/ephemeral` and `workspace/destroy`. It has no handler for `navigate`, `refactor/*` or `action/execute`, so `robos_ide_navigate_to_symbol`, the five refactoring tools and `robos_ide_execute_action` get a 404 in `ipcResult`. Build and install the plugin with `./gradlew buildPlugin` and "Install Plugin from Disk" (see `plugins/intellij-idea/README.md`).

To try the protocol without IntelliJ, the [IntelliJ IDEA Bridge]({{ '/apps/intellij-idea/' | relative_url }}) app answers the same routes with in-memory data.

## Console window

The "IDE Bridge MCP Server Console" has buttons for **Open HelloWorld.java**, **Set Breakpoint (Line 6)** and **Start Debug Session**, counters, open files and run configurations, and a protocol trace with **Clear Trace**. The server registers itself under the id `ide-bridge` in `~/.config/robos/mcp/servers.json` and opens no port of its own unless a `port` option is given.

Source: [`packages/ide-bridge-mcp`](https://github.com/nddipiazza/robos/tree/main/packages/ide-bridge-mcp).
