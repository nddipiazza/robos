#!/usr/bin/env node
/**
 * robos-notify --title "..." --body "..." [--icon info|success|warning|error] [--source myapp]
 * Pushes a notification to the RobOS Desktop Manager via Unix socket.
 * The DM writes it to notifications.json and updates the tray badge.
 */

const net = require('net');

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const title  = flag('--title')  || flag('-t') || 'RobOS';
const body   = flag('--body')   || flag('-b') || '';
const icon   = flag('--icon')   || flag('-i') || 'info';
const source = flag('--source') || flag('-s') || 'robos';

const SOCKET_PATH = `/run/user/${process.getuid()}/robos-dm.sock`;

const client = net.createConnection(SOCKET_PATH, () => {
  client.write(JSON.stringify({ notify: { title, body, icon, source } }));
  client.end();
});

client.on('error', (e) => {
  console.error(`robos-notify: could not reach desktop manager (${e.message})`);
  process.exit(1);
});
