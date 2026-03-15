#!/usr/bin/env node
/**
 * robos-launch <app-id>
 * Sends a launch request to the RobOS Desktop Manager via Unix socket.
 * Used as the Exec= command in all RobOS .desktop files.
 */

const net = require('net');
const { execSync } = require('child_process');

const appId = process.argv[2];
if (!appId) {
  console.error('Usage: robos-launch <app-id>');
  process.exit(1);
}

const SOCKET_PATH = `/run/user/${process.getuid()}/robos-dm.sock`;

const client = net.createConnection(SOCKET_PATH, () => {
  client.write(JSON.stringify({ launch: appId }));
  client.end();
});

client.on('data', (d) => {
  try {
    const res = JSON.parse(d.toString());
    if (res.error) { console.error(`robos-launch error: ${res.error}`); process.exit(1); }
    // Hide the GNOME app grid / overview now that the app is launching
    try {
      execSync(
        `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.overview.hide();"`,
        { stdio: 'ignore', timeout: 2000 }
      );
    } catch {}
  } catch {}
});

client.on('error', (e) => {
  console.error(`robos-launch: could not connect to desktop manager (${e.message})`);
  console.error('Is robos-desktop-manager running?');
  process.exit(1);
});
