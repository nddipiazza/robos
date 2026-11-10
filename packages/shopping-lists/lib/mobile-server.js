'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { renderGoogleDocHtml } = require('./google-docs-format');
const { renderQrSvg } = require('./qr');
const { executeTextCommand, renderPrintableChecklist, renderPrintableGuideHtml } = require('./text-commands');
const { syncWithGoogleDrive, listGoogleAccounts } = require('./google-drive-sync');

const SESSION_COOKIE_NAME = 'robos_shop_session';

function computeSessionCookieValue(secretToken) {
  return crypto.createHmac('sha256', String(secretToken || 'robos-shop-secret'))
    .update('robos-shopping-lists-session-v1')
    .digest('hex');
}

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function safeEqualHex(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (!sa || !sb || sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'));
  } catch {
    return false;
  }
}

function isLocalLoopbackRequest(req) {
  // If proxied through Cloudflare Tunnel or reverse proxy, it is NOT a local loopback request
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip']) {
    return false;
  }
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host && host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
    return false;
  }
  const addr = String(req.socket?.remoteAddress || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function getAllowedGoogleEmails(state) {
  const emails = new Set();
  if (process.env.ROBOS_ALLOWED_GOOGLE_EMAIL) {
    for (const e of process.env.ROBOS_ALLOWED_GOOGLE_EMAIL.split(',')) {
      if (e.trim()) emails.add(e.trim().toLowerCase());
    }
    return [...emails];
  }
  const m = String(state?.sync?.accountId || '').match(/^google-(.+)-gmail-com$/i);
  if (m) emails.add(`${m[1].replace(/-/g, '.')}@gmail.com`.toLowerCase());
  for (const acc of listGoogleAccounts() || []) {
    if (acc.email) emails.add(acc.email.toLowerCase());
  }
  return [...emails];
}

function renderGoogleLoginGateHtml({ state, errorMsg = '' }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const allowedEmails = getAllowedGoogleEmails(state);
  const primaryEmail = allowedEmails[0] || 'your Google account';
  const groceryDocUrl = state?.sync?.docUrls?.grocery || state?.lists?.[0]?.docUrl || '';
  const folderUrl = state?.sync?.folderUrl || 'https://drive.google.com';
  const webClientId = process.env.ROBOS_GOOGLE_WEB_CLIENT_ID || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in with Google · RobOS Shopping Lists</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: #0d1117; color: #f0f6fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { max-width: 440px; width: 100%; background: #161b22; border: 1px solid #30363d; border-radius: 18px; padding: 26px 22px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
    .lock { font-size: 38px; margin-bottom: 10px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 14px; color: #8b949e; line-height: 1.55; margin: 0 0 18px; }
    .email-pill { display: inline-block; background: rgba(56,189,248,0.14); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin-bottom: 18px; }
    .btn-google { display: block; width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 12px; background: #10b981; color: #04130d; font-weight: 800; font-size: 15px; text-decoration: none; margin-bottom: 10px; border: none; cursor: pointer; }
    .btn-secondary { display: block; width: 100%; box-sizing: border-box; padding: 12px 16px; border-radius: 12px; background: #21262d; color: #e2e8f0; font-weight: 600; font-size: 14px; text-decoration: none; border: 1px solid #30363d; margin-bottom: 10px; }
    .steps { text-align: left; font-size: 13px; color: #c9d1d9; background: #0d1117; border: 1px solid #21262d; border-radius: 12px; padding: 12px 14px 12px 28px; margin: 14px 0 0; line-height: 1.55; }
    .err { background: rgba(239,68,68,0.16); color: #fca5a5; border: 1px solid rgba(239,68,68,0.35); padding: 10px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
  </style>
  ${webClientId ? '<script src="https://accounts.google.com/gsi/client" async defer></script>' : ''}
</head>
<body>
  <div class="card">
    <div class="lock">🔒</div>
    <h1>Protected by Google Login</h1>
    <p>This RobOS Household Shopping Lists webapp is private and restricted to your Google account:</p>
    <div class="email-pill">${esc(primaryEmail)}</div>
    ${errorMsg ? `<div class="err">${esc(errorMsg)}</div>` : ''}
    ${webClientId ? `
      <div id="g_id_onload" data-client_id="${esc(webClientId)}" data-callback="onGoogleSignIn" data-auto_prompt="false"></div>
      <div class="g_id_signin" data-type="standard" data-size="large" data-theme="filled_blue" data-text="sign_in_with" data-shape="rectangular" style="display:flex;justify-content:center;margin-bottom:14px;"></div>
      <script>
        async function onGoogleSignIn(response) {
          const res = await fetch('/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
          });
          if (res.ok) window.location.reload();
          else alert((await res.json()).error || 'Google sign-in failed');
        }
      </script>
    ` : ''}
    ${groceryDocUrl ? `
      <a class="btn-google" href="${esc(groceryDocUrl)}">📄 Sign In via My Google Doc (1-Tap)</a>
    ` : ''}
    <a class="btn-secondary" href="${esc(folderUrl)}">📁 Open My Google Drive Folder</a>
    <ol class="steps">
      <li>Tap <strong>Sign In via My Google Doc</strong> above (Google verifies you are signed in as <strong>${esc(primaryEmail)}</strong>).</li>
      <li>At the very top of your Google Doc, tap <strong>📱 Open Interactive Add/Remove Form</strong>.</li>
      <li>Your Android phone receives a 1-year encrypted session cookie and opens the live webapp!</li>
    </ol>
  </div>
</body>
</html>`;
}

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

function renderPairingHtml({ lanUrl, publicTunnelUrl, tailscaleUrl, state }) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const token = state?.sync?.mobileAuthToken || '';
  const withAuth = (u) => {
    if (!u) return '';
    if (!token || u.includes('auth=')) return u;
    return `${u.replace(/\/+$/, '')}/?auth=${encodeURIComponent(token)}`;
  };
  const authedTunnelUrl = withAuth(publicTunnelUrl || state?.sync?.publicTunnelUrl || '');
  const authedLanUrl = withAuth(lanUrl);
  const authedTsUrl = withAuth(tailscaleUrl);

  const tunnelQr = authedTunnelUrl ? renderQrSvg(authedTunnelUrl, { sizePx: 220 }) : '';
  const lanQr = renderQrSvg(authedLanUrl, { sizePx: 220 });
  const tsQr = authedTsUrl ? renderQrSvg(authedTsUrl, { sizePx: 220 }) : '';
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
    .wrap { max-width: 820px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .sub { color: #8b949e; font-size: 14px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 18px; text-align: center; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: rgba(16,185,129,0.16); color: #34d399; margin-bottom: 8px; }
    .qr-box { background: #fff; padding: 12px; border-radius: 12px; display: inline-block; margin: 10px 0; }
    .url { display: block; font-family: ui-monospace, monospace; font-size: 13px; color: #38bdf8; word-break: break-all; margin: 8px 0; text-decoration: none; font-weight: 600; }
    .steps { text-align: left; font-size: 13px; color: #c9d1d9; line-height: 1.55; margin-top: 12px; padding-left: 18px; }
    .docs { margin-top: 18px; background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 16px; }
    .doc-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .doc-link { padding: 8px 14px; border-radius: 8px; background: #21262d; color: #f0f6fc; text-decoration: none; font-size: 13px; font-weight: 600; border: 1px solid #30363d; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📱 Open RobOS Shopping Lists on Android (Zero Tailscale, Google-Gated)</h1>
    <div class="sub">Protected by a 256-bit cryptographic session key embedded in your private Google Docs &amp; QR code below.</div>
    <div class="grid">
      ${authedTunnelUrl ? `
      <div class="card" style="border-color:#10b981;">
        <span class="badge">Anywhere / 5G (Zero Tailscale)</span>
        <div style="font-weight:700;font-size:16px">Google-Gated Public HTTPS URL</div>
        <div class="qr-box">${tunnelQr}</div>
        <a class="url" href="${esc(authedTunnelUrl)}">${esc(publicTunnelUrl || state?.sync?.publicTunnelUrl)}</a>
        <ol class="steps">
          <li>Works from <strong>any network (5G at the store or any Wi-Fi)</strong> with <strong>no Tailscale needed</strong>.</li>
          <li>Also linked at the top of your private <strong>Grocery, Target, and Costco Google Docs</strong> (protected by your Google login).</li>
          <li>Scan once or tap from your Google Doc to set a 1-year encrypted cookie on your phone!</li>
        </ol>
      </div>` : ''}
      <div class="card">
        <span class="badge" style="background:rgba(56,189,248,0.16);color:#38bdf8">Home Wi-Fi (LAN)</span>
        <div style="font-weight:700;font-size:16px">Same Wi-Fi Network</div>
        <div class="qr-box">${lanQr}</div>
        <a class="url" href="${esc(authedLanUrl)}">${esc(lanUrl)}</a>
        <ol class="steps">
          <li>Point your Android camera at the QR code above.</li>
          <li>In Chrome on Android, tap <strong>⋮ (Menu) → Add to Home screen → Install</strong>.</li>
        </ol>
      </div>
      ${authedTsUrl ? `
      <div class="card">
        <span class="badge" style="background:rgba(168,85,247,0.16);color:#c084fc">Tailscale (Optional)</span>
        <div style="font-weight:700;font-size:16px">WireGuard Private IP</div>
        <div class="qr-box">${tsQr}</div>
        <a class="url" href="${esc(authedTsUrl)}">${esc(tailscaleUrl)}</a>
      </div>` : ''}
    </div>
    ${docsHtml ? `
    <div class="docs">
      <div style="font-weight:700;font-size:14px">📄 Open via Your Private Google Docs (Protected by Google Login)</div>
      <div style="font-size:13px;color:#8b949e;margin-top:4px;">Each Google Doc below has the authenticated 1-tap <strong>📱 Open Interactive Add/Remove Form</strong> link at the very top:</div>
      <div class="doc-links">${docsHtml}</div>
    </div>` : ''}
  </div>
</body>
</html>`;
}

function createMobileServer({ store, webDir = path.join(__dirname, '..', 'web'), onMutate, autoSyncDrive = true, requireAuthForRemote = true }) {
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
      const snapForAuth = store.getSnapshot();
      const secretToken = snapForAuth.sync?.mobileAuthToken || '';
      const expectedCookieVal = computeSessionCookieValue(secretToken);

      // 1. Check `?auth=<256-bit-token>` (from private Google Doc or QR code) -> set 1-year HttpOnly cookie & redirect cleanly
      const queryAuth = url.searchParams.get('auth') || url.searchParams.get('key') || '';
      if (queryAuth && secretToken && safeEqualHex(queryAuth, secretToken)) {
        const isHttps = req.headers['x-forwarded-proto'] === 'https' || Boolean(req.headers['cf-ray']);
        const cookieParts = [
          `${SESSION_COOKIE_NAME}=${expectedCookieVal}`,
          'Path=/',
          'Max-Age=31536000',
          'HttpOnly',
          'SameSite=Lax',
        ];
        if (isHttps) cookieParts.push('Secure');
        url.searchParams.delete('auth');
        url.searchParams.delete('key');
        const cleanTarget = url.pathname + (url.search ? url.search : '');
        res.writeHead(302, {
          'Set-Cookie': cookieParts.join('; '),
          Location: cleanTarget || '/',
        });
        res.end();
        return;
      }

      // 2. Google OAuth ID token verification endpoint (`POST /auth/google`)
      if (req.method === 'POST' && p === '/auth/google') {
        const body = await readJsonBody(req);
        const idToken = String(body.credential || body.idToken || '').trim();
        if (!idToken) return sendJson(400, { error: 'Missing Google credential.' });
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (!verifyRes.ok) return sendJson(401, { error: 'Invalid Google ID token.' });
        const tokenInfo = await verifyRes.json();
        const email = String(tokenInfo.email || '').toLowerCase();
        const allowed = getAllowedGoogleEmails(snapForAuth);
        if (tokenInfo.email_verified !== 'true' || (allowed.length > 0 && !allowed.includes(email))) {
          return sendJson(403, { error: `Google account ${email || 'unknown'} is not authorized for this household list.` });
        }
        const isHttps = req.headers['x-forwarded-proto'] === 'https' || Boolean(req.headers['cf-ray']);
        const cookieParts = [
          `${SESSION_COOKIE_NAME}=${expectedCookieVal}`,
          'Path=/',
          'Max-Age=31536000',
          'HttpOnly',
          'SameSite=Lax',
        ];
        if (isHttps) cookieParts.push('Secure');
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': cookieParts.join('; '),
        });
        res.end(JSON.stringify({ ok: true, email }));
        return;
      }

      // 3. Enforce authentication on non-loopback requests (public HTTPS tunnel, external Wi-Fi)
      const isPublicAsset = p === '/manifest.webmanifest' || p === '/icon.svg' || p === '/icon.png' || p === '/sw.js';
      if (requireAuthForRemote && !isLocalLoopbackRequest(req) && !isPublicAsset) {
        const cookies = parseCookies(req.headers.cookie);
        const headerToken = String(req.headers['x-robos-auth'] || '').trim();
        const hasValidCookie = safeEqualHex(cookies[SESSION_COOKIE_NAME], expectedCookieVal);
        const hasValidHeader = secretToken && safeEqualHex(headerToken, secretToken);
        if (!hasValidCookie && !hasValidHeader) {
          if (p.startsWith('/api/')) {
            return sendJson(401, { error: 'Unauthorized. Sign in via your Google Doc or Google Account.' });
          }
          res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderGoogleLoginGateHtml({ state: snapForAuth }));
          return;
        }
      }

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
        const snap = store.getSnapshot();
        const html = renderPairingHtml({
          lanUrl,
          publicTunnelUrl: snap.sync?.publicTunnelUrl || '',
          tailscaleUrl,
          port,
          state: snap,
        });
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
