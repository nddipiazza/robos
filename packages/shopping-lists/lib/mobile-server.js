'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { renderGoogleDocHtml } = require('./google-docs-format');
const { renderQrSvg } = require('./qr');
const { executeTextCommand, renderPrintableChecklist, renderPrintableGuideHtml } = require('./text-commands');

function detectLanIp() {
  try {
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
      for (const info of entries || []) {
        if (info && info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.')) {
          return info.address;
        }
      }
    }
  } catch {}
  return '127.0.0.1';
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

function createMobileServer({ store, webDir = path.join(__dirname, '..', 'web'), onMutate }) {
  const sseClients = new Set();

  const unsubscribe = store.onChange((snapshot, reason) => {
    const payload = `data: ${JSON.stringify({ type: 'state', reason, state: snapshot })}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { sseClients.delete(res); }
    }
  });

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
        return sendJson(200, store.getSnapshot());
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
        if (p === '/api/list/select') out = { state: store.setActiveList(body.listId) };
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
          const cmdRes = await executeTextCommand(store, body.command || body.text || '', { listId: body.listId });
          out = { ...cmdRes, state: store.getSnapshot() };
        }
        else return sendJson(404, { error: 'Unknown API endpoint.' });

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
    return {
      port: boundPort,
      localUrl: `http://127.0.0.1:${boundPort}`,
      lanUrl: `http://${lanIp}:${boundPort}`,
    };
  }

  function close() {
    unsubscribe();
    for (const res of sseClients) {
      try { res.end(); } catch {}
    }
    sseClients.clear();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, listen, close, detectLanIp };
}

module.exports = {
  createMobileServer,
  detectLanIp,
};
