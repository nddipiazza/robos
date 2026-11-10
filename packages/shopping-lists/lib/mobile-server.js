'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { renderGoogleDocHtml } = require('./google-docs-format');
const { renderQrSvg } = require('./qr');
const { executeTextCommand, renderPrintableChecklist, renderPrintableGuideHtml } = require('./text-commands');
const { syncWithGoogleDrive } = require('./google-drive-sync');

function detectLanIp() {
  try {
    const nets = os.networkInterfaces();
    // Prefer physical Wi-Fi / Ethernet IPv4 (192.168.x.x / 10.x.x.x) over Tailscale/Docker
    const candidates = [];
    for (const [ifName, entries] of Object.entries(nets)) {
      if (/^(docker|br-|veth|virbr|lo)/i.test(ifName)) continue;
      for (const info of entries || []) {
        if (info && info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.')) {
          candidates.push({ ifName, address: info.address });
        }
      }
    }
    const lan = candidates.find((c) => !/^tailscale/i.test(c.ifName) && !c.address.startsWith('100.')) || candidates[0];
    if (lan) return lan.address;
  } catch {}
  return '127.0.0.1';
}

function detectTailscaleIp() {
  try {
    const nets = os.networkInterfaces();
    for (const [ifName, entries] of Object.entries(nets)) {
      if (!/^tailscale/i.test(ifName)) continue;
      for (const info of entries || []) {
        if (info && info.family === 'IPv4' && !info.internal) {
          return info.address;
        }
      }
    }
  } catch {}
  return '';
}

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function renderPairingHtml({ lanUrl, tailscaleUrl, port, state }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lanQr = renderQrSvg(lanUrl, { sizePx: 220 });
  const tsQr = tailscaleUrl ? renderQrSvg(tailscaleUrl, { sizePx: 220 }) : '';
  const docsHtml = (state?.lists || []).map((l) => l.docUrl
    ? `<a class="doc-link" href="${esc(l.docUrl)}" target="_blank" rel="noopener">${esc(l.icon)} ${esc(l.name)} Google Doc</a>`
    : '').filter(Boolean).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect Android Phone · RobOS Shopping Lists</title>
  <style>
    body { margin: 0; padding: 24px; background: #0d1117; color: #f0f6fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrap { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .sub { color: #8b949e; font-size: 14px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 18px; text-align: center; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(16,185,129,0.16); color: #34d399; margin-bottom: 8px; }
    .qr-box { background: #fff; padding: 12px; border-radius: 12px; display: inline-block; margin: 10px 0; }
    .url { display: block; font-family: ui-monospace, monospace; font-size: 14px; color: #38bdf8; word-break: break-all; margin: 8px 0; text-decoration: none; font-weight: 600; }
    .steps { text-align: left; font-size: 13px; color: #c9d1d9; line-height: 1.55; margin-top: 12px; padding-left: 18px; }
    .docs { margin-top: 18px; background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 16px; }
    .doc-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .doc-link { padding: 8px 14px; border-radius: 8px; background: #21262d; color: #f0f6fc; text-decoration: none; font-size: 13px; font-weight: 600; border: 1px solid #30363d; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📱 Open RobOS Shopping Lists on Android (Zero Custom App Needed)</h1>
    <div class="sub">Scan with your Android camera or open the URL in Chrome. Tap <strong>⋮ → Add to Home screen</strong> to install it as a full-screen Progressive Web App (PWA).</div>
    <div class="grid">
      <div class="card">
        <span class="badge">Home Wi-Fi (LAN)</span>
        <div style="font-weight:700;font-size:16px">Same Wi-Fi Network</div>
        <div class="qr-box">${lanQr}</div>
        <a class="url" href="${esc(lanUrl)}">${esc(lanUrl)}</a>
        <ol class="steps">
          <li>Point your Android camera at the QR code above (or type the URL in Chrome).</li>
          <li>In Chrome on Android, tap <strong>⋮ (Menu) → Add to Home screen → Install</strong>.</li>
          <li>It launches full-screen on your phone like a native app with live SSE sync!</li>
        </ol>
      </div>
      ${tailscaleUrl ? `
      <div class="card">
        <span class="badge" style="background:rgba(56,189,248,0.16);color:#38bdf8">Tailscale (Anywhere / 5G)</span>
        <div style="font-weight:700;font-size:16px">Store Aisle / Away from Home</div>
        <div class="qr-box">${tsQr}</div>
        <a class="url" href="${esc(tailscaleUrl)}">${esc(tailscaleUrl)}</a>
        <ol class="steps">
          <li>Works from anywhere (5G at the grocery store, Target, or Costco) when Tailscale is on.</li>
          <li>Every item added or checked off syncs with your PC, "Ok Nabu", and Google Docs.</li>
        </ol>
      </div>` : ''}
    </div>
    ${docsHtml ? `
    <div class="docs">
      <div style="font-weight:700;font-size:14px">📄 Or Open Directly in Google Docs / Google Drive on Android</div>
      <div class="doc-links">${docsHtml}</div>
    </div>` : ''}
  </div>
</body>
</html>`;
}

function createMobileServer({ store, webDir = path.join(__dirname, '..', 'web'), onMutate, autoSyncDrive = true }) {
  const sseClients = new Set();
  const pkgRoot = path.join(__dirname, '..');
  let syncTimer = null;

  function scheduleBackgroundDriveSync() {
    if (!autoSyncDrive) return;
    const snap = store.getSnapshot();
    if (!snap.sync?.folderId && !snap.sync?.accountId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncWithGoogleDrive({ store }).catch(() => {});
    }, 350);
  }

  const unsubscribe = store.onChange((snapshot, reason) => {
    const payload = `data: ${JSON.stringify({ type: 'state', reason, state: snapshot })}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { sseClients.delete(res); }
    }
  });

  // Watch store file on disk so external changes ("Ok Nabu" voice commands, CLI) push live via SSE
  const watchedFile = store.filePath;
  if (watchedFile) {
    try {
      fs.watchFile(watchedFile, { interval: 700 }, () => {
        try { store.reload?.(true); } catch {}
      });
    } catch {}
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const sendJson = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };

    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      const p = url.pathname;

      if (req.method === 'GET' && p === '/api/state') {
        const port = server.address()?.port || 19225;
        const lanIp = detectLanIp();
        const tsIp = detectTailscaleIp();
        const snap = store.getSnapshot();
        return sendJson(200, {
          ...snap,
          accessUrls: {
            lanUrl: `http://${lanIp}:${port}`,
            tailscaleUrl: tsIp ? `http://${tsIp}:${port}` : '',
            qrPageUrl: `http://${lanIp}:${port}/qr`,
          },
        });
      }

      if (req.method === 'GET' && p === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify({ type: 'state', reason: 'init', state: store.getSnapshot() })}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (req.method === 'GET' && p === '/api/qr') {
        const text = url.searchParams.get('text') || `http://${detectLanIp()}:${server.address()?.port || 19225}/`;
        const svg = renderQrSvg(text, { sizePx: Number(url.searchParams.get('size') || 200) });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
        res.end(svg);
        return;
      }

      if (req.method === 'GET' && p === '/qr') {
        const port = server.address()?.port || 19225;
        const lanUrl = `http://${detectLanIp()}:${port}/`;
        const tsIp = detectTailscaleIp();
        const tailscaleUrl = tsIp ? `http://${tsIp}:${port}/` : '';
        const html = renderPairingHtml({ lanUrl, tailscaleUrl, port, state: store.getSnapshot() });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && p === '/manifest.webmanifest') {
        const manifest = {
          name: 'RobOS Household Shopping Lists',
          short_name: 'Shopping Lists',
          description: 'Grocery, Target, and Costco household shopping lists with live Google Docs & Ok Nabu voice sync.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#0d1117',
          theme_color: '#0d1117',
          orientation: 'portrait-primary',
          icons: [
            { src: '/icon.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          ],
        };
        res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
        res.end(JSON.stringify(manifest, null, 2));
        return;
      }

      if (req.method === 'GET' && p === '/sw.js') {
        const swJs = `
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/events')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
`.trim();
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(swJs);
        return;
      }

      if (req.method === 'GET' && (p === '/icon.svg' || p === '/icon.png')) {
        const iconFile = path.join(pkgRoot, p.slice(1));
        if (fs.existsSync(iconFile)) {
          res.writeHead(200, { 'Content-Type': p.endsWith('.svg') ? 'image/svg+xml' : 'image/png' });
          res.end(fs.readFileSync(iconFile));
          return;
        }
      }

      if (req.method === 'GET' && p.startsWith('/doc-preview/')) {
        const listId = decodeURIComponent(p.slice('/doc-preview/'.length));
        const snap = store.getSnapshot();
        const list = snap.lists.find((l) => l.id === listId) || snap.lists[0];
        const port = server.address()?.port || 19225;
        const lanUrl = `http://${detectLanIp()}:${port}/`;
        const html = renderGoogleDocHtml(list, {
          syncedAt: snap.sync.lastSyncedAt || snap.updatedAt,
          appsScriptWebAppUrl: snap.sync.appsScriptWebAppUrl,
          mobileLanUrl: lanUrl,
          folderUrl: snap.sync.folderUrl,
          docUrls: snap.sync.docUrls,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && (p === '/guide' || p === '/api/guide')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderPrintableGuideHtml());
        return;
      }

      if (req.method === 'GET' && p === '/print') {
        const listId = url.searchParams.get('list') || 'all';
        const text = renderPrintableChecklist(store.getSnapshot(), listId, 'all');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(text);
        return;
      }

      if (req.method === 'GET' && p.startsWith('/api/export-csv/')) {
        const listId = decodeURIComponent(p.slice('/api/export-csv/'.length));
        const { filename, csv } = store.exportHouseholdCsv(listId);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(csv);
        return;
      }

      if (req.method === 'POST' && p.startsWith('/api/')) {
        const body = await readJsonBody(req);
        let out;
        let shouldSyncDrive = true;
        if (p === '/api/list/select') {
          shouldSyncDrive = false;
          out = { state: store.setActiveList(body.listId) };
        }
        else if (p === '/api/list/create') out = store.createList(body);
        else if (p === '/api/item/add') out = store.addItem(body.listId, body);
        else if (p === '/api/item/toggle') out = store.toggleItem(body.listId, body.itemId, body.checked);
        else if (p === '/api/item/qty') out = store.adjustItemQty(body.listId, body.itemId, body.delta);
        else if (p === '/api/item/update') out = store.updateItem(body.listId, body.itemId, body.patch || body);
        else if (p === '/api/item/remove') out = store.removeItem(body.listId, body.itemId);
        else if (p === '/api/list/clear-checked') out = store.clearChecked(body.listId);
        else if (p === '/api/list/check-all') out = store.checkAll(body.listId, body.checked);
        else if (p === '/api/list/undo') out = store.undo();
        else if (p === '/api/smart-add') out = store.smartBatchAdd(body.text, body.listId);
        else if (p === '/api/command') {
          shouldSyncDrive = false; // executeTextCommand already syncs Drive
          const cmdRes = await executeTextCommand(store, body.command || body.text || '', { listId: body.listId });
          out = { ...cmdRes, state: store.getSnapshot() };
        }
        else if (p === '/api/sync') {
          shouldSyncDrive = false;
          const syncRes = await syncWithGoogleDrive({ store });
          out = { syncResult: syncRes, state: store.getSnapshot() };
        }
        else return sendJson(404, { error: 'Unknown API endpoint.' });

        if (shouldSyncDrive) {
          scheduleBackgroundDriveSync();
        }
        if (onMutate) {
          try { onMutate(p, body); } catch {}
        }
        return sendJson(200, { ok: true, ...out });
      }

      // Static mobile web app assets
      const staticMap = {
        '/': ['index.html', 'text/html; charset=utf-8'],
        '/index.html': ['index.html', 'text/html; charset=utf-8'],
        '/style.css': ['style.css', 'text/css; charset=utf-8'],
        '/app.js': ['app.js', 'application/javascript; charset=utf-8'],
      };
      if (req.method === 'GET' && staticMap[p]) {
        const [rel, mime] = staticMap[p];
        const content = fs.readFileSync(path.join(webDir, rel));
        res.writeHead(200, { 'Content-Type': mime });
        res.end(content);
        return;
      }

      sendJson(404, { error: 'Not found.' });
    } catch (err) {
      sendJson(400, { error: err.message || 'Request failed.' });
    }
  });

  async function listen(preferredPort = 19225, host = '0.0.0.0') {
    const tryListen = (port) => new Promise((resolve, reject) => {
      const onError = (err) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });

    let boundPort;
    try {
      boundPort = await tryListen(preferredPort);
    } catch {
      boundPort = await tryListen(0);
    }
    const lanIp = detectLanIp();
    const tsIp = detectTailscaleIp();
    return {
      port: boundPort,
      localUrl: `http://127.0.0.1:${boundPort}`,
      lanUrl: `http://${lanIp}:${boundPort}`,
      tailscaleUrl: tsIp ? `http://${tsIp}:${boundPort}` : '',
    };
  }

  function close() {
    clearTimeout(syncTimer);
    if (watchedFile) {
      try { fs.unwatchFile(watchedFile); } catch {}
    }
    unsubscribe();
    for (const res of sseClients) {
      try { res.end(); } catch {}
    }
    sseClients.clear();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, listen, close, detectLanIp, detectTailscaleIp };
}

module.exports = {
  createMobileServer,
  detectLanIp,
  detectTailscaleIp,
};
