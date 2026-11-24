#!/usr/bin/env node
'use strict';

/**
 * RobOS Preferences Sync Daemon (`robos-preferences-sync.service`)
 *
 * Keeps RobOS Preferences (Config Sync Backup Vault) AND connected RobOS Media Services
 * continuously updated in the background, even when no desktop UI windows are open.
 *
 * Whenever a RobOS Media Server is configured (locally or pulled from Config Sync) or
 * new movies/shows/music/books are indexed on the server, this service automatically
 * updates Movie Player, Audio Player, Books, and MCP Manager.
 */

const path = require('node:path');
const fs = require('node:fs');

function requireShared(name) {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, name),
    path.resolve(__dirname, '..', '..', 'robos-lib', name),
    `/usr/local/share/robos/robos-lib/${name}`,
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p) || fs.existsSync(`${p}.js`)) {
      return require(p);
    }
  }
  throw new Error(`Could not locate robos-lib/${name}`);
}

const configSyncAuto = requireShared('config-sync-auto');
const mediaServiceClient = requireShared('media-service-client');

const vaultLoop = configSyncAuto.startAutoSync({
  loginDelayMs: 3000,
  log: (msg) => console.log(`[RobOS Preferences Sync] vault: ${msg}`),
});

const mediaLoop = mediaServiceClient.startMediaServiceAutoSync({
  startDelayMs: 1500,
  intervalMs: Number(process.env.ROBOS_MEDIA_SERVICE_POLL_MS || 45000),
  log: (msg) => console.log(`[RobOS Preferences Sync] media: ${msg}`),
});

console.log('[RobOS Preferences Sync] Background vault & RobOS Media Service sync active.');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    try { vaultLoop.stop(); } catch {}
    try { mediaLoop.stop(); } catch {}
    process.exit(0);
  });
}
