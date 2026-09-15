# Imported MCP connections

Graph Explorer's **Populate RobOS apps → MCP servers & gateways** step imports
remote connection metadata into the app catalog. It does not connect an agent or
open a browser. Existing source-level MCP definitions without a remote endpoint
remain architecture definitions rather than being treated as deployed servers.

Use `robos:MCPConnection` alongside `robos:MCPServer`, or `robos:MCPGateway`, with
`dcterms:title`, `robos:endpoint` (HTTPS), `robos:authType` (`oauth` or `none`),
optional `robos:environment`, and source evidence. Authorization metadata is
obtained from the endpoint using MCP discovery; never put credentials in a graph.

RobOS Agents lists each imported connection for every provider. Check a connection
to enable it for that provider's new sessions. A changed endpoint requires a new
opt-in. Task Runner also offers per-launch checkboxes and uses the same catalog;
changing the model does not reset the chosen connections. Existing running agent
processes retain their launch configuration.

## Authentication

**Sign in with Chrome** reuses a valid saved login or starts one OAuth PKCE flow.
The shared loopback service owns callbacks and tokens for all agents. The official
MCP SDK handles protected-resource discovery, client registration, authorization,
and token refresh when the server issues a refresh token. Tokens and client
credentials are encrypted in `pass` under `robos/mcp/<endpoint-hash>`; neither
agent configs nor disposable sandboxes receive them.

Concurrent requests to an endpoint serialize refresh. Repeated sign-in clicks
reuse the in-progress login. Callback state is validated, expires after five
minutes, and cannot be exchanged twice. Pending login UI polls only local status
and updates to Connected, failure, or timeout. Background requests never open
Chrome: they report login required and create a deduplicated notification. A
network failure is reported separately from an expired login. Failed tool calls
are not blindly retried.

Hermetiq dev and production currently issue eight-hour access tokens without
refresh tokens. RobOS reuses those tokens across providers and service restarts;
after expiry, one explicit browser login is required. Browser SSO may complete
that flow without asking for credentials again.

## Agent transport

Codex, AGY, Claude Code and Copilot terminal launches receive a RobOS stdio MCP
adapter. Codex and AGY Task Runner sandboxes use the authenticated host bridge,
retaining their shell isolation. Only selected endpoints contribute tools, with
namespaces to prevent collisions. A disconnected connection offers a status tool;
a successful reconnect signals that the tool catalog can refresh. Enabling a
server does not authorize every operation it exposes: agents must still follow
the user's task scope and approval rules.

The host service listens on 127.0.0.1:19196 and requires a random, mode-0600 local
capability for its API. Remote task sandboxes currently need the local Docker
bridge. The supported remote transport is Streamable HTTP; stdio-only source
servers and legacy SSE endpoints are not automatically converted.

Run unit checks with `node --test packages/robos-mcp-router/lib/*.test.cjs`.
