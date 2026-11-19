#!/usr/bin/env node
'use strict';

/**
 * Starts the Google-Gated RobOS Camera Watch Web Browser Server (`:19227`), opens an
 * outbound-only Cloudflare HTTPS Quick Tunnel (`cloudflared tunnel --url http://127.0.0.1:19227`),
 * and automatically creates/updates the private Google Doc in the user's Google Drive with the
 * 1-tap authenticated browser link (`https://<slug>.trycloudflare.com/?auth=<256-bit-key>`).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createStore } = require('./lib/store');
const { createWebShareStore, createCameraWebServer, DEFAULT_WEB_PORT } = require('./lib/web-viewer');
const { syncCameraGoogleDoc } = require('./lib/google-doc-share');

function findCloudflaredBin() {
  const candidates = [
    process.env.CLOUDFLARED_BIN,
    path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ].filter(Boolean);
  return candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || '';
}

function startCloudflareTunnel({ localUrl, lanUrl, cameraStore, webShareStore, onReady }) {
  const bin = findCloudflaredBin();
  if (!bin || process.env.CAMERA_WATCH_NO_TUNNEL === '1') {
    console.error('[camera-watch-web] cloudflared binary not found or disabled.');
    return { stop: () => {} };
  }

  let stopped = false;
  let currentChild = null;

  const launch = () => {
    if (stopped) return;
    const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', localUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    currentChild = child;
    let announced = false;

    const onOutput = (chunk) => {
      if (announced) return;
      const text = String(chunk || '');
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (!m) return;
      announced = true;
      const tunnelUrl = m[0];
      const ws = webShareStore.save({ publicTunnelUrl: tunnelUrl });
      const authedTunnelUrl = `${tunnelUrl}/?auth=${ws.authToken}`;
      const authedLanUrl = `${lanUrl}/?auth=${ws.authToken}`;

      console.log(`  • Public HTTPS (Cloudflare, Google-Gated): ${tunnelUrl}`);
      console.log(`  • Authenticated 1-Tap Launch Link:         ${authedTunnelUrl}`);

      const cams = cameraStore.listCameras().filter((c) => c.enabled !== false && c.kind !== 'device');
      const camerasForDoc = cams.length ? cams : cameraStore.listCameras().filter((c) => c.enabled !== false);

      syncCameraGoogleDoc({
        cameras: camerasForDoc,
        webConfig: ws,
        authedTunnelUrl,
        publicTunnelUrl: tunnelUrl,
        authedLanUrl,
      })
        .then((synced) => {
          webShareStore.save({
            accountId: synced.accountId,
            ownerEmail: synced.ownerEmail,
            folderId: synced.folderId,
            folderUrl: synced.folderUrl,
            docId: synced.docId,
            docUrl: synced.docUrl,
            docTitle: synced.docTitle,
            syncedAt: synced.syncedAt,
          });
          console.log(`  • Google Doc Updated in Drive:             ${synced.docUrl}`);
          console.log(`  • Google Drive Folder:                     ${synced.folderUrl}`);
          onReady?.({ tunnelUrl, authedTunnelUrl, ...synced });
        })
        .catch((err) => {
          console.error('[camera-watch-web] Google Doc sync warning:', err.message);
          onReady?.({ tunnelUrl, authedTunnelUrl, error: err.message });
        });
    };

    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.on('close', () => {
      if (!stopped) {
        setTimeout(launch, 4000);
      }
    });
  };

  launch();
  return {
    stop() {
      stopped = true;
      try { currentChild?.kill('SIGTERM'); } catch {}
    },
  };
}

async function main() {
  const homeDir = process.env.HOME || os.homedir();
  const configDir = process.env.ROBOS_CONFIG_DIR || path.join(homeDir, '.config', 'robos');
  const port = Number(process.env.CAMERA_WATCH_WEB_PORT || process.env.PORT || DEFAULT_WEB_PORT);
  const host = process.env.HOST || '0.0.0.0';

  const cameraStore = createStore({ configDir, homeDir });
  const webShareStore = createWebShareStore({ configDir });
  const viewer = createCameraWebServer({ cameraStore, webShareStore });
  const info = await viewer.listen(port, host);
  const ws = webShareStore.load();

  console.log('RobOS Camera Watch — Google-Gated Web Browser Server:');
  console.log(`  • Local Loopback: ${info.localUrl}`);
  console.log(`  • Home Wi-Fi LAN: ${info.lanUrl}/?auth=${ws.authToken}`);

  const tunnel = startCloudflareTunnel({
    localUrl: info.localUrl,
    lanUrl: info.lanUrl,
    cameraStore,
    webShareStore,
  });

  const shutdown = async () => {
    tunnel.stop();
    await viewer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startCloudflareTunnel, findCloudflaredBin };
