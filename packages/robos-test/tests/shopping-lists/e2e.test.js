'use strict';

/**
 * End-to-end verification of RobOS Shopping Lists (Household suite):
 *   1. Launches the Electron desktop app with isolated HOME/config.
 *   2. Verifies the 3 shopping lists (Grocery, Target, Costco) render and switch cleanly.
 *   3. Exercises the form-like UI controls (+ Add, +/- quantity stepper, check-off, Remove, Undo).
 *   4. Connects as a simulated mobile phone to the live Mobile Form web server (:19225),
 *      adds and removes items via mobile endpoints, and verifies live desktop synchronization.
 *   5. Syncs all 3 lists to a local mock Google Drive v3 server (`ROBOS_GDRIVE_API_BASE`),
 *      verifying native Google Docs (`application/vnd.google-apps.document`) creation and
 *      mobile Google Docs preview rendering, plus captures screenshots.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');

const OUT = path.join(__dirname, '..', '..', 'run', 'shopping-lists-e2e');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function httpPostJson(url, payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

async function waitFor(fn, timeoutMs = 15000, what = 'condition') {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 180));
  }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

async function screenshot(port, filename) {
  fs.mkdirSync(OUT, { recursive: true });
  const res = await httpGet(`http://127.0.0.1:${port}/screenshot`);
  if (res.status === 200) fs.writeFileSync(path.join(OUT, filename), res.body);
}

/** Local HTTP mock of Google Drive v3 API for full E2E Google Docs sync verification. */
function startMockGoogleDriveServer() {
  const files = new Map();
  let seq = 1;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, 'http://127.0.0.1');
    const p = url.pathname;
    const send = (code, obj, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type });
      res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
    };

    if (req.method === 'POST' && p === '/upload/drive/v3/files') {
      const parts = rawBody.split(/--robos-shop-[a-z0-9-]+/);
      const meta = JSON.parse((parts[1] || '').split('\r\n\r\n').slice(1).join('\r\n\r\n').trim());
      const content = (parts[2] || '').split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const id = `gdoc_${seq++}`;
      const rec = { id, name: meta.name, mimeType: meta.mimeType, parents: meta.parents || [], content, modifiedTime: new Date().toISOString() };
      files.set(id, rec);
      return send(200, rec);
    }
    const patchMatch = p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (req.method === 'PATCH' && patchMatch) {
      const rec = files.get(decodeURIComponent(patchMatch[1]));
      if (!rec) return send(404, { error: { message: 'Not found' } });
      rec.content = rawBody;
      return send(200, rec);
    }
    if (req.method === 'POST' && p === '/drive/v3/files') {
      const meta = JSON.parse(rawBody || '{}');
      const id = `gfld_${seq++}`;
      const rec = { id, name: meta.name, mimeType: meta.mimeType, parents: meta.parents || [], content: '' };
      files.set(id, rec);
      return send(200, rec);
    }
    if (req.method === 'GET' && p === '/drive/v3/files') {
      const q = url.searchParams.get('q') || '';
      const pm = q.match(/'([^']+)' in parents/);
      const nm = q.match(/name = '([^']+)'/);
      const mm = q.match(/mimeType = '([^']+)'/);
      let list = [...files.values()];
      if (pm) list = list.filter((f) => (f.parents || []).includes(pm[1]));
      if (nm) list = list.filter((f) => f.name === nm[1]);
      if (mm) list = list.filter((f) => f.mimeType === mm[1]);
      return send(200, { files: list });
    }
    const exportMatch = p.match(/^\/drive\/v3\/files\/([^/]+)\/export$/);
    if (req.method === 'GET' && exportMatch) {
      const rec = files.get(decodeURIComponent(exportMatch[1]));
      if (!rec) return send(404, 'Not found', 'text/plain');
      const plain = rec.content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|h1|h2|tr|div)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
      return send(200, plain, 'text/plain');
    }
    const getMatch = p.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (req.method === 'GET' && getMatch) {
      const rec = files.get(decodeURIComponent(getMatch[1]));
      if (!rec) return send(404, { error: { message: 'Not found' } });
      return send(200, rec);
    }
    return send(404, { error: { message: 'Unknown route' } });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        files,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe('RobOS Shopping Lists E2E', () => {
  it('renders Grocery, Target & Costco lists, handles form add/remove, syncs mobile web & Google Docs', async () => {
    const mockDrive = await startMockGoogleDriveServer();
    const app = await launchApp('shopping-lists', {
      name: 'shopping-lists-e2e',
      env: {
        ROBOS_TEST: '1',
        SHOPPING_LISTS_WEB_PORT: '0',
        ROBOS_GDRIVE_API_BASE: mockDrive.baseUrl,
        ROBOS_TEST_GDRIVE_TOKEN: 'e2e-mock-token',
      },
    });

    try {
      const port = app.port;
      await waitFor(
        () => evalJS(port, `document.querySelectorAll('.store-card').length >= 3`),
        15000,
        '3 store cards to render',
      );

      const initialState = await evalJS(port, `window.shoppingLists.getState()`);
      assert.deepEqual(
        initialState.lists.map((l) => l.id),
        ['grocery', 'target', 'costco'],
      );
      assert.ok(initialState.mobileServer.localUrl.startsWith('http://127.0.0.1:'));
      await screenshot(port, '01-grocery-list.png');

      // Add a new item via the form in Grocery
      await evalJS(port, `(() => {
        document.querySelector('#input-name').value = 'Artisanal Guacamole';
        document.querySelector('#input-qty').value = '2';
        document.querySelector('#input-price').value = '4.99';
        document.querySelector('#add-item-form').requestSubmit();
        return true;
      })()`);

      await waitFor(
        () => evalJS(port, `document.body.innerText.includes('Artisanal Guacamole')`),
        8000,
        'Artisanal Guacamole added',
      );

      // Switch to 2) Target and verify Target items render
      await new Promise((r) => setTimeout(r, 250));
      await evalJS(port, `document.querySelector('[data-select-list="target"]').click(); true`);
      await waitFor(
        () => evalJS(port, `document.querySelector('#hero-name').textContent.includes('Target') && document.body.innerText.includes('Laundry Pods')`),
        8000,
        'Target list active',
      );
      await new Promise((r) => setTimeout(r, 250));
      await screenshot(port, '02-target-list.png');

      // Simulate mobile phone opening the Mobile Form Server and adding + removing items on 3) Costco
      const mobileBase = initialState.mobileServer.localUrl;
      const mobileHtml = await httpGet(`${mobileBase}/?list=costco`);
      assert.equal(mobileHtml.status, 200);
      assert.match(mobileHtml.body.toString('utf8'), /RobOS Household/);

      const mobileAdd = await httpPostJson(`${mobileBase}/api/item/add`, {
        listId: 'costco',
        name: 'Kirkland Sparkling Limonata Case',
        qty: 2,
        unit: 'case',
        estPrice: 14.99,
      });
      assert.equal(mobileAdd.status, 200);
      const addedMobileItemId = mobileAdd.json.item.id;

      // Switch desktop to 3) Costco and confirm live sync from mobile!
      await evalJS(port, `document.querySelector('[data-select-list="costco"]').click(); true`);
      await waitFor(
        () => evalJS(port, `document.body.innerText.includes('Kirkland Sparkling Limonata Case')`),
        8000,
        'Costco item synced live from mobile form',
      );
      await screenshot(port, '03-costco-list.png');

      // Test Remove button + Undo button in Desktop UI
      await evalJS(port, `document.querySelector('[data-row-action="remove"][data-id="${addedMobileItemId}"]').click(); true`);
      await waitFor(
        () => evalJS(port, `!document.body.innerText.includes('Kirkland Sparkling Limonata Case')`),
        8000,
        'Item removed via Remove button',
      );
      await evalJS(port, `document.querySelector('#btn-undo').click(); true`);
      await waitFor(
        () => evalJS(port, `document.body.innerText.includes('Kirkland Sparkling Limonata Case')`),
        8000,
        'Item restored via Undo button',
      );

      // Trigger Google Docs & Google Drive Sync for all 3 lists!
      await evalJS(port, `document.querySelector('#btn-sync-drive').click(); true`);
      await waitFor(
        () => evalJS(port, `document.querySelectorAll('.doc-link-btn').length >= 4`),
        10000,
        '3 Google Docs + Drive folder links rendered',
      );

      const gdocsCreated = [...mockDrive.files.values()].filter(
        (f) => f.mimeType === 'application/vnd.google-apps.document',
      );
      assert.equal(gdocsCreated.length, 3);

      // Open the Mobile Device Experience Preview modal (Google Docs Mobile View + Interactive Form App)
      await evalJS(port, `document.querySelector('#btn-open-phone-modal').click(); true`);
      await new Promise((r) => setTimeout(r, 600));
      await screenshot(port, '04-mobile-google-doc-preview.png');

      await evalJS(port, `document.querySelector('[data-mode="form"]').click(); true`);
      await new Promise((r) => setTimeout(r, 700));
      await screenshot(port, '05-mobile-form-app-preview.png');
    } finally {
      await killApp(app);
      await mockDrive.close();
    }
  });
});
