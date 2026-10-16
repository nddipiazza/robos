---
title: "MCP Server Framework"
package: robos-mcp-lib
category: services
summary: "Node.js library for building small Model Context Protocol servers, with an HTTP and a stdio transport and a shared registry file."
description: "The base that the RobOS system, task and workspace MCP servers are built on. The package's own window is an inspector for a demo server with two sample tools."
---

`robos-mcp-lib` is a library first. Other packages (`system-mcp`, `task-manager-mcp`, `workspace-manager-mcp` and several more under `packages/`) call it to define their tools and resources.

## What the library provides

```javascript
const { createMCPServer, startStdioTransport, listRegisteredServers } = require('../robos-mcp-lib/index');

const server = createMCPServer({
  appId: 'demo',
  tools: [{ name: 'hello', description: 'Say hello', handler: async () => 'hi' }],
  port: 19200,            // optional; omit to skip HTTP
});
```

- **JSON-RPC 2.0 handling** for `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list` and `resources/read`, reporting protocol version `2024-11-05`. Any other method returns error `-32601`.
- **Naming.** A tool named `hello` in app `demo` becomes `robos_demo_hello`; names that already start with `robos_` are kept. A resource URI such as `info` becomes `robos://demo/info`.
- **HTTP transport** (`startHttp(port)` or the `port` option): `POST /mcp` for JSON-RPC and `GET /health`, with permissive CORS headers.
- **stdio transport** (`startStdioTransport(server)`): one JSON request per line on stdin, one response per line on stdout.
- **Registry.** When a server starts it writes itself to `~/.config/robos/mcp/servers.json` (app id, name, version, port, endpoint, tool names, resource URIs). `stop()` removes the entry. The [MCP Router]({{ '/apps/robos-mcp-router/' | relative_url }}) reads this file.

A tool handler's return value is sent back as one text block (strings as-is, other values as pretty-printed JSON). If the handler throws, the result has `isError: true` and the error message.

## The inspector window

`main.js` creates a demo server with the tools `calculate_metrics` and `query_workspace` and the resource `system-info`, and shows them in **RobOS MCP Server Inspector & Framework**. The tool results are fixed sample values. Click **Call calculate_metrics** to see the request and response in the protocol trace; **Clear Trace** empties it. The demo server has no HTTP port. Run it with `npm start` in `packages/robos-mcp-lib` (there is no `.desktop` launcher). `npm test` runs `node --test`.
