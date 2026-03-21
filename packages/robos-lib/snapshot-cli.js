#!/usr/bin/env node
/**
 * RobOS Snapshot CLI — capture DOM snapshots from running Electron apps.
 *
 * Usage:
 *   node snapshot-cli.js <app-id> [--text|--json|--screenshot] [--port PORT]
 *
 * Connects to the app's debug HTTP server inside the VM via SSH port forwarding.
 * Default debug port = 19100 + app index (see robos-lib for port registry).
 *
 * Examples:
 *   node snapshot-cli.js app-launcher --text
 *   node snapshot-cli.js dev-central --screenshot > shot.png
 *   node snapshot-cli.js app-launcher --json | jq '.children[0]'
 */

const http = require('http');

// Debug port registry: each app gets a unique port
const PORT_REGISTRY = {
  'app-launcher': 19100,
  'dev-central': 19101,
  'git-projects': 19102,
  'issue-manager': 19103,
  'agents-manager': 19104,
  'agent-scheduler': 19105,
  'context-manager': 19106,
  'tech-workbench': 19107,
  'work-journal': 19108,
  'ide-manager': 19109,
  'workspace-manager': 19110,
  'lang-manager': 19111,
  'task-servers': 19112,
  'pass-manager': 19113,
  'security-setup': 19114,
  'notifications': 19115,
  'robos-preferences': 19116,
  'file-explorer': 19117,
  'claude-console': 19118,
  'search-index': 19119,
  'workflow-studio': 19120,
  'desktop-dashboard': 19121,
  'pass-unlock': 19122,
  'git-login-manager': 19123,
};

function getPort(appId) {
  return PORT_REGISTRY[appId] || 19100;
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node snapshot-cli.js <app-id> [--text|--json|--screenshot] [--port PORT]');
    console.error('\nRegistered apps:', Object.keys(PORT_REGISTRY).join(', '));
    process.exit(1);
  }

  const appId = args[0];
  const mode = args.includes('--screenshot') ? 'screenshot'
    : args.includes('--json') ? 'snapshot'
    : 'text-snapshot';

  const portIdx = args.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : getPort(appId);

  const endpoint = mode === 'screenshot' ? '/screenshot' : `/${mode}`;
  const url = `http://localhost:${port}${endpoint}`;

  try {
    const { status, data } = await fetch(url);
    if (status !== 200) {
      console.error(`Error ${status}: ${data}`);
      process.exit(1);
    }

    if (mode === 'screenshot') {
      // Write binary PNG to stdout
      process.stdout.write(Buffer.from(data, 'binary'));
    } else {
      console.log(data);
    }
  } catch (err) {
    console.error(`Cannot connect to ${appId} debug server at ${url}`);
    console.error(`Make sure the app is running with debug server enabled.`);
    console.error(`You may need SSH port forwarding: ssh -L ${port}:localhost:${port} -p 2224 robos@localhost`);
    process.exit(1);
  }
}

main();
