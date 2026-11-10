#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createStore } = require('./lib/store');
const { createMobileServer } = require('./lib/mobile-server');
const { syncWithGoogleDrive } = require('./lib/google-drive-sync');

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

function startPublicHttpsTunnel(localUrl, store) {
  const bin = findCloudflaredBin();
  if (!bin || process.env.SHOPPING_LISTS_NO_TUNNEL === '1') return null;

  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', localUrl], {
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
    const snap = store.getSnapshot();
    const token = snap.sync?.mobileAuthToken || '';
    const authedTunnelUrl = token ? `${tunnelUrl}/?auth=${token}` : tunnelUrl;
    store.updateSyncConfig({
      publicTunnelUrl: tunnelUrl,
      appsScriptWebAppUrl: authedTunnelUrl,
    });
    console.log(`  • Public 5G HTTPS (Google-Gated, Zero Tailscale): ${tunnelUrl}`);
    console.log(`  • Authenticated 1-Tap Link (embedded in your Google Docs): ${authedTunnelUrl}`);
    if (snap.sync?.folderId || snap.sync?.accountId) {
      syncWithGoogleDrive({ store, appsScriptWebAppUrl: authedTunnelUrl })
        .then(() => console.log('  • Updated Grocery, Target, and Costco Google Docs with your authenticated 1-tap mobile form link!'))
        .catch(() => {});
    }
  };

  child.stdout.on('data', onLine);
  child.stderr.on('data', onLine);
  return child;
}

async function main() {
  const port = Number(process.env.SHOPPING_LISTS_WEB_PORT || process.env.PORT || 19225);
  const host = process.env.HOST || '0.0.0.0';
  const store = createStore();
  const mobile = createMobileServer({ store });
  const info = await mobile.listen(port, host);
  const snap = store.getSnapshot();
  const token = snap.sync?.mobileAuthToken || '';
  console.log(`RobOS Household Shopping Lists mobile PWA server:`);
  console.log(`  • Local:     ${info.localUrl}`);
  console.log(`  • Home Wi-Fi: ${info.lanUrl}/?auth=${token}`);
  if (info.tailscaleUrl) {
    console.log(`  • Tailscale:  ${info.tailscaleUrl}/?auth=${token}`);
  }
  console.log(`  • Phone QR:   ${info.localUrl}/qr`);
  startPublicHttpsTunnel(info.localUrl, store);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
