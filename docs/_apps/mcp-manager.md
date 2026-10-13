---
title: "MCP Manager"
package: mcp-manager
category: ai-agents
icon: mcp-manager.svg
summary: "Lists the MCP servers registered on this machine, lets you call their tools from a form, and records which agents should have which servers."
description: "MCP Manager reads ~/.config/robos/mcp/servers.json and calls tools over HTTP when a server has an endpoint. Otherwise the tester returns a simulated result, and the saved agent access matrix is not enforced by anything yet."
---

MCP Manager is a small admin window for the MCP servers that RobOS apps register. It has three tabs: **Registered Servers**, **Tool & Resource Tester** and **Agent Access Matrix**. Counters above them show servers, tools and resources discovered.

## Registered Servers

The list comes from `~/.config/robos/mcp/servers.json`, which MCP server packages such as [CI Monitor MCP]({{ '/apps/ci-monitor-mcp/' | relative_url }}) write when they start. Entries from the knowledge graph (`getMCPServers` in `packages/robos-graph`) are merged in, and each registry entry is written back to the graph as an MCP server node. If the registry file is empty, the app writes three sample entries (Task Manager, Workspace Manager, Developer Tool Center) with made-up ports 19131 to 19133, so a fresh install shows those until real servers register.

## Tool & Resource Tester

Pick a tool, edit the **Input Parameters (JSON)** and click **Execute Tool**. The result appears under **Live Output**.

- If the server entry has an `endpoint`, the app sends a JSON-RPC `tools/call` (or `resources/read`) request to it by HTTP with a 3 second timeout.
- If there is no endpoint, or the request fails, the app returns a **simulated** `SUCCESS` result (or sample task items for resources). Most servers in this repository register without a port, so they have no endpoint, and the tester shows simulated output for them.

{: .important }
Treat a "SUCCESS" in Live Output as real only when the server entry has an `endpoint` and it was reachable. A simulated reply echoes your tool name and parameters and reports `recordsUpdated: 1`.

## Agent Access Matrix

A grid of servers against Claude Code, Gemini CLI and Copilot CLI. **Save Access Configuration** writes the checkboxes to `~/.config/robos/mcp-config.json`. Nothing in the repository reads that file today, so the matrix records intent without changing any agent's configuration. To edit the MCP servers a coding agent actually uses, see [Agents Manager]({{ '/apps/agents-manager/' | relative_url }}) (per-provider MCP lists) or [Agent Autoconfig]({{ '/apps/agent-autoconfig/' | relative_url }}).

Run it with `electron packages/mcp-manager`. Source: [`packages/mcp-manager`](https://github.com/nddipiazza/robos/tree/main/packages/mcp-manager).
