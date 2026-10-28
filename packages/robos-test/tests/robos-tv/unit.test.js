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

describe('Tablo 4th Gen OTA DVR integration', () => {
  it('signs requests with HMAC-MD5 tablo:<device_key>:<sig> and serves /api/tablo/recordings and /api/tablo/image/:id', async () => {
    const tabloPort = await freePort();
    const portalPort = await freePort();
    const seenAuthHeaders = [];
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const mockTablo = http.createServer((req, res) => {
      seenAuthHeaders.push(req.headers.authorization || '');
      if (!String(req.headers.authorization || '').startsWith('tablo:ljpg6ZkwShVv8aI12E2LP55Ep8vq1uYDPvX0DdTB:')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'unauthorized', description: 'Authentication failure' } }));
        return;
      }
      if (req.url === '/server/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          server_id: 'SID_5087B8556EE5',
          name: 'Tablo',
          version: '2.2.58',
          build_number: 2612800,
          availability: 'ready',
          setup_completed: true,
          model: { name: 'Tablo 4G DUAL 128GB', type: 't4g2', tuners: 2, wifi: true },
        }));
        return;
      }
      if (req.url === '/server/harddrives') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ name: 'Sabrent SSD 1.00 (1000 GB)', usage: 71568179200, free: 911781167104 }]));
        return;
      }
      if (req.url === '/server/tuners') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ in_use: false }, { in_use: false }]));
        return;
      }
      if (req.url === '/settings/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ led: 'on' }));
        return;
      }
      if (req.url === '/recordings/airings') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(['/recordings/sports/events/186022']));
        return;
      }
      if (req.url === '/recordings/sports/events/186022') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          object_id: 186022,
          path: '/recordings/sports/events/186022',
          snapshot_image: { image_id: 186023 },
          airing_details: {
            datetime: '2026-10-25T20:25Z',
            duration: 11100,
            show_title: 'NFL Football',
            channel: { channel: { call_sign: 'WMSNFOX', major: 47, minor: 1, network: 'FOX', resolution: 'hd_720' } },
          },
          video_details: { state: 'finished', duration: 18315, size: 18523795456, width: 1280, height: 720, container_format: 'mpeg2', audio: 'ac3' },
          event: { title: 'Green Bay Packers at Detroit Lions', description: 'NFC North matchup at Ford Field.' },
        }));
        return;
      }
      if (req.url === '/images/186023') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(fakeJpeg);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((r) => mockTablo.listen(tabloPort, '127.0.0.1', r));
    cleanups.push(() => new Promise((r) => mockTablo.close(r)));

    const engine = makeEngine(portalPort, { appName: 'robos-tv' });
    engine.setTabloDevice({ ip: '127.0.0.1', port: tabloPort });
    await engine.startPortalServer();

    const ov = await engine.getTabloOverview({ ip: '127.0.0.1', port: tabloPort });
    assert.strictEqual(ov.ok, true);
    assert.strictEqual(ov.status.serverId, 'SID_5087B8556EE5');
    assert.strictEqual(ov.recordings.length, 1);
    assert.strictEqual(ov.recordings[0].fullTitle, 'NFL Football: Green Bay Packers at Detroit Lions');

    const httpRecs = await request(portalPort, { pathname: `/api/tablo/recordings?ip=127.0.0.1&port=${tabloPort}` });
    assert.strictEqual(httpRecs.status, 200);
    assert.strictEqual(httpRecs.json.count, 1);

    const httpImg = await request(portalPort, { pathname: `/api/tablo/image/186023?ip=127.0.0.1&port=${tabloPort}` });
    assert.strictEqual(httpImg.status, 200);
    assert.ok(httpImg.buf.equals(fakeJpeg));
    assert.ok(seenAuthHeaders.length > 0);
  });
});

