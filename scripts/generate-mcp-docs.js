#!/usr/bin/env node
'use strict';
// Generate the MCP server reference from the server definitions themselves.
//
// Writes:
//   docs/mcp/tools.json   machine-readable contract: every server, its tools
//                         (name, description, inputSchema) and resources, in
//                         the shapes MCP's tools/list and resources/list return
//   docs/mcp-servers.md   the human-readable reference page for the docs site
//
// Usage:
//   node scripts/generate-mcp-docs.js           # regenerate both files
//   node scripts/generate-mcp-docs.js --check   # exit 1 if either is out of date
//
// Creating a server registers it in ~/.config/robos/mcp/servers.json and some
// servers seed state under ~/.config/robos/, so this runs with HOME pointed at
// a throwaway directory. Nothing in your real profile is touched.

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_JSON = path.join(REPO_ROOT, 'docs', 'mcp', 'tools.json');
const OUT_MD = path.join(REPO_ROOT, 'docs', 'mcp-servers.md');
const CHECK = process.argv.includes('--check');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-mcp-docs-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;

// Package, factory export, and options. The EKGraph server only exposes the
// robos_sdlc_* workspace tools when a graph root is configured, so it is given
// this repository's own graph to document them.
const SERVERS = [
  { pkg: 'task-manager-mcp', factory: 'createTaskMCPServer' },
  { pkg: 'ekgraph-mcp', factory: 'createEKGraphMCPServer', options: { graphRoot: REPO_ROOT },
    note: 'The `robos_sdlc_*` tools are only listed when a graph workspace is configured with `ROBOS_GRAPH_ROOT` (or the `graphRoot` option). Without one the server offers the other tools only. See [WORKSPACES.md](https://github.com/nddipiazza/robos/blob/main/packages/robos-graph/WORKSPACES.md).' },
  { pkg: 'workspace-manager-mcp', factory: 'createWorkspaceMCPServer' },
  { pkg: 'ci-monitor-mcp', factory: 'createCIMonitorMCPServer' },
  { pkg: 'ide-bridge-mcp', factory: 'createIDEBridgeMCPServer',
    note: 'Talks to the IntelliJ IDEA plugin on port 63343. Tools that drive the IDE need IntelliJ running with the RobOS plugin installed.' },
  { pkg: 'system-mcp', factory: 'createSystemMCPServer' },
  { pkg: 'dev-tools-mcp', factory: 'createDevToolsMCPServer' },
];

async function rpc(server, method, params) {
  const res = await server.handleJsonRpc({ jsonrpc: '2.0', id: 1, method, params });
  if (res.error) throw new Error(`${method}: ${res.error.message}`);
  return res.result;
}

async function collect() {
  const out = [];
  for (const def of SERVERS) {
    const mod = require(path.join(REPO_ROOT, 'packages', def.pkg, 'server.js'));
    const factory = mod[def.factory];
    if (typeof factory !== 'function') throw new Error(`${def.pkg}/server.js does not export ${def.factory}`);
    const { server } = factory(def.options || {});
    const init = await rpc(server, 'initialize', {});
    const { tools } = await rpc(server, 'tools/list', {});
    const { resources } = await rpc(server, 'resources/list', {});
    out.push({
      package: `packages/${def.pkg}`,
      factory: def.factory,
      appId: server.appId,
      serverInfo: init.serverInfo,
      protocolVersion: init.protocolVersion,
      description: server.description,
      note: def.note || null,
      tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      resources: (resources || []).map(r => ({ uri: r.uri, name: r.name, mimeType: r.mimeType, description: r.description })),
    });
    try { server.stop(); } catch {}
  }
  return out;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function typeOf(schema) {
  if (!schema) return 'any';
  if (schema.enum) return schema.enum.map(v => `\`${v}\``).join(' \\| ');
  if (schema.type === 'array') return `${typeOf(schema.items)}[]`;
  if (Array.isArray(schema.type)) return schema.type.join(' \\| ');
  return schema.type || 'any';
}

function paramsTable(schema) {
  const props = (schema && schema.properties) || {};
  const names = Object.keys(props);
  if (!names.length) return '_No parameters._\n';
  const required = new Set((schema && schema.required) || []);
  const rows = names.map(n => {
    const p = props[n] || {};
    const extra = [];
    if (p.default !== undefined) extra.push(`Default \`${JSON.stringify(p.default)}\`.`);
    if (p.minimum !== undefined || p.maximum !== undefined) extra.push(`Range ${p.minimum ?? ''}–${p.maximum ?? ''}.`);
    return `| \`${n}\` | ${typeOf(p)} | ${required.has(n) ? 'yes' : ''} | ${esc([p.description, ...extra].filter(Boolean).join(' '))} |`;
  });
  return ['| Parameter | Type | Required | Description |', '|:---|:---|:---|:---|', ...rows, ''].join('\n');
}

function renderMarkdown(servers) {
  const toolCount = servers.reduce((n, s) => n + s.tools.length, 0);
  const L = [];
  L.push('---');
  L.push('title: MCP servers');
  L.push('layout: default');
  L.push('parent: Build on RobOS');
  L.push('nav_order: 7');
  L.push('description: "The Model Context Protocol servers RobOS ships: how agents connect to them, the transport and methods they speak, and every tool\'s input schema."');
  L.push('---');
  L.push('');
  L.push('<!-- Generated by scripts/generate-mcp-docs.js. Do not edit by hand; change the server definitions and regenerate. -->');
  L.push('');
  L.push('# MCP servers');
  L.push('{: .no_toc }');
  L.push('');
  L.push('RobOS exposes tasks, the knowledge graph, workspaces, CI, the IDE and the desktop to coding agents through [Model Context Protocol](https://modelcontextprotocol.io/) servers. This page is the API contract for each one. The same data, in the shape `tools/list` and `resources/list` return, is in [`docs/mcp/tools.json`](https://github.com/nddipiazza/robos/blob/main/docs/mcp/tools.json).');
  L.push('{: .fs-6 }');
  L.push('');
  L.push('<details open markdown="block">');
  L.push('  <summary>On this page</summary>');
  L.push('  {: .text-delta }');
  L.push('1. TOC');
  L.push('{:toc}');
  L.push('</details>');
  L.push('');
  L.push('## Servers');
  L.push('');
  L.push('| Server | Package | Version | Tools | Resources |');
  L.push('|:---|:---|:---|:---|:---|');
  for (const s of servers) {
    L.push(`| ${esc(s.serverInfo.name)} | \`${s.package}\` | ${s.serverInfo.version} | ${s.tools.length} | ${s.resources.length} |`);
  }
  L.push('');
  L.push(`${toolCount} tools in all. Every server reports MCP protocol version \`${servers[0].protocolVersion}\`.`);
  L.push('');
  L.push('## Connect an agent');
  L.push('');
  L.push('Agents connect to one stdio server, the router in `packages/robos-mcp-router`. It merges the tools of every RobOS server registered in `~/.config/robos/mcp/servers.json` and forwards each `tools/call` to the server that owns the tool.');
  L.push('');
  L.push('Claude Code (`.mcp.json` or `~/.claude.json`), and the same `mcpServers` block for other agents that read it:');
  L.push('');
  L.push('```json');
  L.push('{');
  L.push('  "mcpServers": {');
  L.push('    "robos": {');
  L.push('      "command": "node",');
  L.push('      "args": ["/path/to/robos/packages/robos-mcp-router/cli.js", "--stdio"]');
  L.push('    }');
  L.push('  }');
  L.push('}');
  L.push('```');
  L.push('');
  L.push('On the appliance VM the router is installed at `/usr/local/share/robos/robos-mcp-router/cli.js`. `node packages/robos-mcp-router/cli.js --claude-config` prints that block, and `packages/claude-autoconfig` writes it for Claude Code.');
  L.push('');
  L.push('Codex (`~/.codex/config.toml`):');
  L.push('');
  L.push('```toml');
  L.push('[mcp_servers.robos]');
  L.push('command = "node"');
  L.push('args = ["/path/to/robos/packages/robos-mcp-router/cli.js", "--stdio"]');
  L.push('```');
  L.push('');
  L.push('### Start a server');
  L.push('');
  L.push('Each package exports a factory from `server.js`. Given a `port`, the server listens on HTTP and records its endpoint in the registry, so the router can forward calls to it:');
  L.push('');
  L.push('```bash');
  L.push('node -e "require(\'./packages/task-manager-mcp/server\').createTaskMCPServer({ port: 7311 })"');
  L.push('```');
  L.push('');
  L.push('Without a port (the default when the server\'s desktop app starts it) the server only registers its tool names. The router then answers `tools/list` with those names and runs a small built-in set of task and graph tools in-process; other calls need the server running with a port.');
  L.push('');
  L.push('## Protocol');
  L.push('');
  L.push('JSON-RPC 2.0. The router speaks it over stdio, one JSON message per line. A server started with a port speaks it over HTTP.');
  L.push('');
  L.push('| Method | Result |');
  L.push('|:---|:---|');
  L.push('| `initialize` | `protocolVersion`, `serverInfo` (`name`, `version`) and `capabilities` (`tools`, `resources`) |');
  L.push('| `ping` | `{}` |');
  L.push('| `tools/list` | `{ tools: [{ name, description, inputSchema }] }` |');
  L.push('| `tools/call` | `params: { name, arguments }`. Returns `{ content: [{ type: "text", text }] }`, where `text` is the handler\'s result (JSON for objects). A handler error returns `isError: true`. |');
  L.push('| `resources/list` | `{ resources: [{ uri, name, mimeType, description }] }` |');
  L.push('| `resources/read` | `params: { uri }`. Returns `{ contents: [{ uri, mimeType, text }] }` |');
  L.push('');
  L.push('HTTP endpoints of a server started with a port:');
  L.push('');
  L.push('| Endpoint | Purpose |');
  L.push('|:---|:---|');
  L.push('| `POST /mcp` | One JSON-RPC request in the body, one response back |');
  L.push('| `GET /health` | `{ ok, appId, name, version, tools, resources }` |');
  L.push('');
  L.push('Tool names are `robos_<area>_<action>`; a tool defined without the `robos_` prefix is renamed `robos_<appId>_<name>`. Resource URIs are `robos://<appId>/<path>`. Both rules are in `packages/robos-mcp-lib/server.js`.');
  L.push('');
  L.push('### Example');
  L.push('');
  L.push('```bash');
  L.push('printf \'%s\\n\' \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\' | node packages/robos-mcp-router/cli.js');
  L.push('```');
  L.push('');
  L.push('```bash');
  L.push('curl -s localhost:7311/mcp -H \'Content-Type: application/json\' \\');
  L.push('  -d \'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"robos_tasks_list","arguments":{"status":"IN_PROGRESS"}}}\'');
  L.push('```');
  L.push('');
  L.push('## Write a server');
  L.push('');
  L.push('Build it on `packages/robos-mcp-lib`, the same way the servers below are built:');
  L.push('');
  L.push('```js');
  L.push("const { createMCPServer } = require('../robos-mcp-lib');");
  L.push('');
  L.push('function createMyMCPServer(options = {}) {');
  L.push('  const server = createMCPServer({');
  L.push("    appId: 'my-app',");
  L.push("    name: 'My App MCP Server',");
  L.push("    version: '1.0.0',");
  L.push('    port: options.port || null,');
  L.push('    tools: [{');
  L.push("      name: 'robos_myapp_list',");
  L.push("      description: 'List items.',");
  L.push("      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },");
  L.push('      handler: async (args) => listItems(args.query),');
  L.push('    }],');
  L.push("    resources: [{ uri: 'items', name: 'Items', handler: async () => listItems() }],");
  L.push('  });');
  L.push('  return { server };');
  L.push('}');
  L.push('```');
  L.push('');
  L.push('Then add it to `SERVERS` in `scripts/generate-mcp-docs.js` and regenerate this page. Tests for the servers are in `packages/robos-test/tests/mcp-servers/`.');
  L.push('');
  L.push('{% raw %}');
  for (const s of servers) {
    L.push('');
    L.push(`## ${s.serverInfo.name}`);
    L.push('');
    L.push(`\`${s.package}\` · \`${s.factory}()\` · version ${s.serverInfo.version} · app ID \`${s.appId}\``);
    L.push('');
    if (s.description) { L.push(esc(s.description) + '.'); L.push(''); }
    if (s.note) { L.push(s.note); L.push(''); }
    if (s.resources.length) {
      L.push('### Resources');
      L.push('');
      L.push('| URI | Name | Type | Description |');
      L.push('|:---|:---|:---|:---|');
      for (const r of s.resources) L.push(`| \`${r.uri}\` | ${esc(r.name)} | ${esc(r.mimeType)} | ${esc(r.description)} |`);
      L.push('');
    }
    L.push('### Tools');
    L.push('');
    for (const t of s.tools) {
      L.push(`#### \`${t.name}\``);
      L.push('');
      L.push(esc(t.description) || '_No description._');
      L.push('');
      L.push(paramsTable(t.inputSchema));
      L.push('<details markdown="block"><summary>Input schema</summary>');
      L.push('');
      L.push('```json');
      L.push(JSON.stringify(t.inputSchema, null, 2));
      L.push('```');
      L.push('');
      L.push('</details>');
      L.push('');
    }
  }
  L.push('{% endraw %}');
  L.push('');
  return L.join('\n');
}

function writeOrCheck(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (CHECK) {
    if (current !== content) { console.error(`out of date: ${path.relative(REPO_ROOT, file)}`); return false; }
    return true;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`wrote ${path.relative(REPO_ROOT, file)}`);
  return true;
}

collect()
  .then(servers => {
    const json = JSON.stringify({
      $comment: 'Generated by scripts/generate-mcp-docs.js. Do not edit by hand.',
      protocolVersion: servers[0].protocolVersion,
      router: { package: 'packages/robos-mcp-router', command: 'node', args: ['packages/robos-mcp-router/cli.js', '--stdio'] },
      servers,
    }, null, 2) + '\n';
    const ok = [writeOrCheck(OUT_JSON, json), writeOrCheck(OUT_MD, renderMarkdown(servers))].every(Boolean);
    if (CHECK && ok) console.log('MCP docs are up to date');
    fs.rmSync(tmpHome, { recursive: true, force: true });
    process.exit(ok ? 0 : 1);
  })
  .catch(err => {
    console.error(err);
    fs.rmSync(tmpHome, { recursive: true, force: true });
    process.exit(1);
  });
