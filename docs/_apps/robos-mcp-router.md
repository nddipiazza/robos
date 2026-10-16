---
title: "MCP Router"
package: robos-mcp-router
category: services
summary: "Single MCP endpoint that lists the tools of the servers in the registry and routes tool calls to them, with built-in fallbacks."
description: "Reads ~/.config/robos/mcp/servers.json, merges the tools and resources it finds, and exposes them over stdio. When a call cannot reach a server it falls back to local handlers, some of which return sample data."
---

The router lets an agent such as Claude Code connect to one MCP server and see the tools of the other RobOS servers. Treat it as an early implementation: parts of it return canned data, described below.

## Connect an agent

The package provides the command `robos-mcp-router` (`cli.js`), which speaks JSON-RPC over stdin and stdout. Print a ready-made client config with:

```bash
node packages/robos-mcp-router/cli.js --claude-config
```

The output registers a server named `robos` that runs `node /usr/local/share/robos/robos-mcp-router/cli.js --stdio`, so the path assumes a RobOS install. The Router Console window has a **Claude Config** button that shows the same JSON.

## How routing works

- `tools/list` and `resources/list` merge the entries in `~/.config/robos/mcp/servers.json`, which servers built with [MCP Server Framework]({{ '/apps/robos-mcp-lib/' | relative_url }}) write on start. If that file is empty or missing, the router lists five built-in sample servers (task-manager, ekgraph, kube-studio, rest-client, workspace-manager) instead.
- `tools/call` finds the server that owns the tool name. If that server has an HTTP endpoint, the request is forwarded. If the endpoint is missing or the request fails, the router runs its own handler. Because of this fallback, a successful response does not prove the target server answered.
- Local handlers: `robos_tasks_*` tools read and write `~/.config/robos/tasks/tasks.json`. `robos_kube_deploy` and `robos_kube_get_pods` run `kubectl`, and return sample output if it fails. `robos_rest_send_request` sends a real HTTP request, and on a connection error returns a hard-coded sample response. `robos_ekgraph_*` tools always return a fixed sample result. Any other tool name gets a generic `SUCCESS` echo.
- `resources/read` returns a placeholder object, not the resource's content.

## The console window

**RobOS Unified MCP Router Console** shows the number of servers, aggregated tools and resources, and a dispatch log. **Test Task Manager Route** sends a sample call. Run it with `npm start` in `packages/robos-mcp-router`; there is no `.desktop` launcher. `npm test` runs `node --test`.
