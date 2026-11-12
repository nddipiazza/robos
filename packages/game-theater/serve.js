#!/usr/bin/env node
'use strict';

/**
 * Standalone daemon for RobOS AI Multiplayer Game Theater:
 *   - HTTP Game & WebSocket Server (:19228)
 *   - Native HTTPS Godot 4 Web Client & WSS Server (:19229)
 *   - Outbound Public HTTPS Tunnel (`cloudflared`) + Automatic Per-Player Google Doc Sync
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { updateTheaterSettings } = require('./lib/player-registry');
const { syncPlayerLaunchDocsWithGoogleDrive } = require('./lib/player-doc-sync');
const { createGameTheaterServer } = require('./lib/theater-server');

function findCloudflaredBin() {
  const candidates = [
    process.env.CLOUDFLARED_BIN,
    path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ].filter(Boolean);
  return (
    candidates.find((p) => {
      try { return fs.existsSync(p); } catch { return false; }
    }) || ''
  );
}

function startPublicHttpsTunnel(localHttpUrl, options = {}) {
  const bin = findCloudflaredBin();
  if (!bin || process.env.GAME_THEATER_NO_TUNNEL === '1') return null;

  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', localHttpUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let announced = false;
  const onLine = (chunk) => {
    if (announced) return;
    const text = String(chunk || '');
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!m) return;
    announced = true;
    const tunnelUrl = m[0];
    updateTheaterSettings({ publicTunnelUrl: tunnelUrl }, options);
    console.log(`  • Public HTTPS Tunnel (Google-Doc Gated): ${tunnelUrl}`);
    if (options.autoSyncDocs !== false) {
      syncPlayerLaunchDocsWithGoogleDrive({ ...options, webAppUrl: tunnelUrl })
        .then((res) => {
          console.log(`  • Synced ${res.totalPlayerDocs} Per-Player Google Docs (${res.hostDocUrl})`);
        })
        .catch((err) => {
          console.warn(`  • Google Doc auto-sync note: ${err.message}`);
        });
    }
  };

  child.stdout.on('data', onLine);
  child.stderr.on('data', onLine);
  return child;
}

async function main() {
  const httpPort = Number(process.env.GAME_THEATER_PORT || 19228);
  const httpsPort = Number(process.env.GAME_THEATER_HTTPS_PORT || 19229);
  const host = process.env.HOST || '0.0.0.0';

  const srv = createGameTheaterServer();
  const info = await srv.listen({ httpPort, httpsPort, host, enableHttps: true });

  console.log('RobOS AI Multiplayer Game Theater Server (Godot 4 HTTPS Web Client):');
  console.log(`  • Local HTTP:       ${info.localHttpUrl}`);
  console.log(`  • LAN Native HTTPS: ${info.lanHttpsUrl}`);
  startPublicHttpsTunnel(info.localHttpUrl);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { findCloudflaredBin, startPublicHttpsTunnel };
