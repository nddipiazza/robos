'use strict';

// Unit tests for the 10-foot TV portal ownership handshake in
// robos-lib/tv-engine: owner reporting in /api/status, reuse when the port
// is taken, and the loopback-only shutdown that lets Smart TV Studio take
// the port back from a stale server.

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

const tv = require(path.resolve(__dirname, '..', '..', '..', 'robos-lib', 'tv-engine'));

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function makeEngine(port, opts = {}) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-tv-portal-'));
  // Keep the seeded state from pointing the engine at :19210.
  fs.writeFileSync(path.join(configDir, 'tv-studio.json'), JSON.stringify({ portalPort: port }));
  const engine = tv.createTvEngine({ configDir, portalPort: port, reusePortal: true, ...opts });
  cleanups.push(async () => {
    await engine.stopPortalServer();
    fs.rmSync(configDir, { recursive: true, force: true });
  });
  return engine;
}

function request(port, { method = 'GET', pathname = '/api/status', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, json, buf: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('TV portal ownership', () => {
  it('reports the serving process in /api/status', async () => {
    const port = await freePort();
    const engine = makeEngine(port, { appName: 'robos-tv' });
    const started = await engine.startPortalServer();
    assert.strictEqual(started.port, port);
    const { json } = await request(port);
    assert.strictEqual(json.app, 'robos-tv-portal');
    assert.strictEqual(json.owner.pid, process.pid);
    assert.strictEqual(json.owner.appName, 'robos-tv');
    assert.strictEqual(json.owner.codeVersion, tv.PORTAL_CODE_VERSION);
    assert.match(tv.PORTAL_CODE_VERSION, /^[0-9a-f]{12}$/);
    assert.ok(json.owner.features.includes('shutdown'));
  });

  it('returns the owner when it reuses a port another engine serves', async () => {
    const port = await freePort();
    const owner = makeEngine(port, { appName: 'robos-dashboards', codeVersion: 'old000000000' });
    await owner.startPortalServer();
    const studio = makeEngine(port, { appName: 'robos-tv' });
    const res = await studio.startPortalServer();
    assert.strictEqual(res.reused, true);
    assert.strictEqual(res.owner.appName, 'robos-dashboards');
    assert.strictEqual(res.owner.codeVersion, 'old000000000');

    const o = await studio.getPortalOwnership();
    assert.strictEqual(o.serving, false);
    assert.strictEqual(o.reachable, true);
    assert.strictEqual(o.robosApp, true);
    assert.strictEqual(o.sameVersion, false);
    assert.strictEqual(o.stale, true);
    assert.strictEqual(o.canRestart, true);
  });

  it('flags a non-app owner such as a leftover node script', async () => {
    const port = await freePort();
    const script = makeEngine(port, { appName: 'node-script' });
    await script.startPortalServer();
    const studio = makeEngine(port, { appName: 'robos-tv' });
    await studio.startPortalServer();
    const o = await studio.getPortalOwnership();
    assert.strictEqual(o.sameVersion, true);
    assert.strictEqual(o.robosApp, false);
    assert.strictEqual(o.stale, true);
  });

  it('pushes live dashboard frames to the serving process', async () => {
    const port = await freePort();
    const owner = makeEngine(port, { appName: 'robos-dashboards' });
    await owner.startPortalServer();
    const studio = makeEngine(port, { appName: 'robos-tv' });
    await studio.startPortalServer();
    const frame = Buffer.alloc(6000, 7);
    studio.setLiveDashboardFrame(frame);
    for (let i = 0; i < 40 && !owner.getLiveDashboardFrame().buffer; i++) await new Promise((r) => setTimeout(r, 25));
    assert.ok(owner.getLiveDashboardFrame().buffer?.equals(frame));
    const served = await request(port, { pathname: '/api/dashboard-live-frame.jpg' });
    assert.strictEqual(served.status, 200);
    assert.ok(served.buf.equals(frame));
  });
});

describe('TV portal shutdown handshake', () => {
  it('rejects shutdown requests without the RobOS header or from a web page', async () => {
    const port = await freePort();
    const engine = makeEngine(port);
    await engine.startPortalServer();
    const bare = await request(port, { method: 'POST', pathname: '/api/portal/shutdown' });
    assert.strictEqual(bare.status, 403);
    const fromPage = await request(port, {
      method: 'POST',
      pathname: '/api/portal/shutdown',
      headers: { 'x-robos-portal': 'shutdown', Origin: 'https://example.com' },
    });
    assert.strictEqual(fromPage.status, 403);
    const asGet = await request(port, { pathname: '/api/portal/shutdown', headers: { 'x-robos-portal': 'shutdown' } });
    assert.strictEqual(asGet.status, 403);
    assert.strictEqual((await request(port)).json.owner.pid, process.pid, 'still serving');
  });

  it('restartPortal makes the caller serve the port after the stale owner releases it', async () => {
    const port = await freePort();
    let releasedTo = null;
    const stale = makeEngine(port, {
      appName: 'node-script',
      codeVersion: 'stale0000000',
      onPortalReleased: (by) => { releasedTo = by; },
    });
    await stale.startPortalServer();
    const studio = makeEngine(port, { appName: 'robos-tv' });
    assert.strictEqual((await studio.startPortalServer()).reused, true);

    const res = await studio.restartPortal();
    assert.strictEqual(res.ok, true, res.error);
    assert.strictEqual(res.port, port);
    assert.strictEqual(res.previousOwner.codeVersion, 'stale0000000');
    assert.deepStrictEqual(releasedTo, { pid: process.pid, appName: 'robos-tv' });

    const { json } = await request(port);
    assert.strictEqual(json.owner.appName, 'robos-tv');
    assert.strictEqual(json.owner.codeVersion, tv.PORTAL_CODE_VERSION);
    assert.strictEqual((await studio.getPortalOwnership()).serving, true);

    // The released engine falls back to reusing the new owner instead of racing it.
    const again = await stale.startPortalServer();
    assert.strictEqual(again.reused, true);
    assert.strictEqual((await stale.getPortalOwnership()).serving, false);
  });

  it('binds directly when nothing holds the port', async () => {
    const port = await freePort();
    const studio = makeEngine(port, { appName: 'robos-tv' });
    const res = await studio.restartPortal();
    assert.strictEqual(res.ok, true, res.error);
    assert.strictEqual((await request(port)).json.owner.appName, 'robos-tv');
  });

  it('never touches a server that cannot do the handshake', async () => {
    const port = await freePort();
    let shutdownHits = 0;
    // An old portal build: answers /api/status without owner info, HTML elsewhere.
    const legacy = http.createServer((req, res) => {
      if (req.url.startsWith('/api/portal/shutdown')) shutdownHits++;
      if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, app: 'robos-tv-portal' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html></html>');
    });
    await new Promise((r) => legacy.listen(port, '0.0.0.0', r));
    cleanups.push(() => new Promise((r) => legacy.close(r)));

    const studio = makeEngine(port, { appName: 'robos-tv' });
    assert.strictEqual((await studio.startPortalServer()).reused, true);
    const o = await studio.getPortalOwnership();
    assert.strictEqual(o.legacy, true);
    assert.strictEqual(o.stale, true);
    assert.strictEqual(o.canRestart, false);
    if (o.listener) assert.strictEqual(o.listener.pid, process.pid);

    const res = await studio.restartPortal();
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /older RobOS build/);
    assert.strictEqual(shutdownHits, 0);
    assert.strictEqual(legacy.listening, true);
  });
});
