#!/usr/bin/env node
/**
 * RobOS Snapshot CLI — DOM snapshots and Electron-native UI interaction.
 *
 * Snapshot usage:
 *   node snapshot-cli.js <app-id> [--text|--json|--screenshot] [--port PORT]
 *
 * Interaction usage (CSS-selector driven, no xdotool):
 *   node snapshot-cli.js <app-id> --click  <selector>
 *   node snapshot-cli.js <app-id> --fill   <selector> --value <value>
 *   node snapshot-cli.js <app-id> --select <selector> --value <value>
 *   node snapshot-cli.js <app-id> --eval   <js-expression>
 *
 * Event recorder (LogRocket-style DOM session replay):
 *   node snapshot-cli.js <app-id> --record-start
 *   node snapshot-cli.js <app-id> --record-drain
 *   node snapshot-cli.js <app-id> --record-stop
 *
 * All commands connect to the app's debug HTTP server on its registered port.
 * Use --port PORT to override. Add --vm to SSH-forward through the RobOS VM.
 *
 * Examples:
 *   node snapshot-cli.js task-servers --text
 *   node snapshot-cli.js task-servers --click 'button#btn-add'
 *   node snapshot-cli.js task-servers --fill  'input#server-name' --value 'Acme Jira'
 *   node snapshot-cli.js task-servers --record-start
 *   node snapshot-cli.js task-servers --record-drain | jq '.events[] | select(.type=="click")'
 */

const http  = require('http');
const https = require('https');

// Debug port registry: each app gets a unique port
const PORT_REGISTRY = {
  'app-launcher':      19100,
  'dev-central':       19101,
  'git-projects':      19138,
  'issue-manager':     19103,
  'agents-manager':    19104,
  'agent-scheduler':   19105,
  'context-manager':   19106,
  'tech-workbench':    19107,
  'work-journal':      19108,
  'ide-manager':       19109,
  'workspace-manager': 19110,
  'lang-manager':      19111,
  'task-servers':      19112,
  'pass-manager':      19113,
  'security-setup':    19114,
  'notifications':     19115,
  'robos-preferences': 19116,
  'file-explorer':     19117,
  'claude-console':    19118,
  'search-index':      19119,
  'workflow-studio':   19120,
  'desktop-dashboard': 19121,
  'pass-unlock':       19122,
  'git-login-manager': 19123,
  'task-board':        19124,
  'desktop-manager':   19125,
  'robos-toast':       19126,
  'desktop-widgets':   19127,
  'automation-studio': 19128,
  'pr-review':         19129,
  'ci-monitor':        19130,
  'stage-demo':        19131,
  'group-manager':     19132,
  'people-directory':  19133,
  'task-planner':      19134,
  'task-implementer':  19135,
  'robos-logs':        19136,
  'skills-manager':    19139,
  'ai-prompt':         19140,
  'robos-desktop':     19141,
  'robos-onboarding':  19142,
  'robos-cli':         19143,
  'robos-profiled':    19144,
  'robos-agentd':      19145,
  'agent-sidebar':     19146,
  'desktop-agents':    19147,
  'robos-agent-session': 19148,
  'robos-mcp-lib':     19149,
  'mcp-manager':       19150,
  'robos-mcp-router':  19151,
  'task-manager-mcp':  19152,
  'workspace-manager-mcp': 19153,
  'ekgraph-mcp':       19154,
  'ci-monitor-mcp':    19155,
  'ide-bridge-mcp':    19156,
  'intellij-idea':     19157,
  'system-mcp':        19158,
  'agent-autoconfig':  19159,
  'dev-tools-mcp':     19160,
  'robos-graph':       19161,
  'adapter-studio':    19167,
  'gitea-browser':     19175,
  'kube-studio':       19176,
  'rest-client':       19177,
  'data-sources':      19178,
  'db-manager':        19179,
  'nosql-manager':     19180,
  'grpc-client':       19181,
  'graphql-client':    19182,
  'app-wizard':        19183,
};



function getPort(appId) {
  return PORT_REGISTRY[appId] || 19100;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node snapshot-cli.js <app-id> [options]');
    console.error('\nRegistered apps:', Object.keys(PORT_REGISTRY).join(', '));
    process.exit(1);
  }

  const appId   = args[0];
  const portIdx = args.indexOf('--port');
  const port    = portIdx !== -1 ? parseInt(args[portIdx + 1]) : getPort(appId);
  const base    = `http://localhost:${port}`;

  const flag = (name) => {
    const i = args.indexOf(name);
    return i !== -1 ? (args[i + 1] || true) : null;
  };

  try {
    // ── Interaction ──────────────────────────────────────────────────────────
    if (flag('--click')) {
      const r = await httpPost(`${base}/click`, { selector: flag('--click') });
      console.log(JSON.parse(r.data.toString()));

    } else if (flag('--fill')) {
      const r = await httpPost(`${base}/fill`, { selector: flag('--fill'), value: flag('--value') || '' });
      console.log(JSON.parse(r.data.toString()));

    } else if (flag('--select')) {
      const r = await httpPost(`${base}/select`, { selector: flag('--select'), value: flag('--value') || '' });
      console.log(JSON.parse(r.data.toString()));

    } else if (flag('--eval')) {
      const r = await httpPost(`${base}/eval`, { js: flag('--eval') });
      console.log(JSON.parse(r.data.toString()));

    // ── Event recorder ───────────────────────────────────────────────────────
    } else if (args.includes('--record-start')) {
      const r = await httpPost(`${base}/events/start`, {});
      console.log(JSON.parse(r.data.toString()));

    } else if (args.includes('--record-drain')) {
      const r = await httpGet(`${base}/events/drain`);
      process.stdout.write(r.data);

    } else if (args.includes('--record-stop')) {
      const r = await httpGet(`${base}/events/stop`);
      process.stdout.write(r.data);

    // ── Snapshots ────────────────────────────────────────────────────────────
    } else {
      const mode = args.includes('--screenshot') ? 'screenshot'
        : args.includes('--json') ? 'snapshot'
        : 'text-snapshot';
      const endpoint = mode === 'screenshot' ? '/screenshot' : `/${mode}`;
      const { status, data } = await httpGet(`${base}${endpoint}`);
      if (status !== 200) { console.error(`Error ${status}: ${data}`); process.exit(1); }
      process.stdout.write(data);
    }

  } catch (err) {
    console.error(`Cannot connect to ${appId} debug server at ${base}`);
    console.error('Make sure the app is running with debug server enabled.');
    console.error(`SSH port-forward hint: ssh -L ${port}:localhost:${port} -p 2224 robos@localhost`);
    process.exit(1);
  }
}

main();

