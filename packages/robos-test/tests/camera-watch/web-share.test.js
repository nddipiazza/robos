'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-cam-webshare-'));
after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

const appDir = path.resolve(__dirname, '..', '..', '..', 'camera-watch');
const { createStore } = require(path.join(appDir, 'lib', 'store'));
const { createWebShareStore, createCameraWebServer } = require(path.join(appDir, 'lib', 'web-viewer'));
const { renderCameraGoogleDocHtml } = require(path.join(appDir, 'lib', 'google-doc-share'));

function httpRequest(urlStr, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

describe('Camera Watch Google-Gated Web Browser Mode & Cloudflare Capability Gate', () => {
  it('blocks unauthenticated Cloudflare-proxied visitors with 401 and exchanges ?auth= for a 1-year HttpOnly cookie', async () => {
    const configDir = path.join(tmpHome, 'cfg');
    const cameraStore = createStore({ configDir, homeDir: tmpHome });
    const savedCam = cameraStore.saveCamera({
      name: 'XT2125-4 Camera',
      kind: 'onvif',
      streamUrl: 'http://192.168.1.65:8080/video',
      snapshotUrl: 'http://192.168.1.65:8080/snapshot.jpg',
      onvif: { hostname: '192.168.1.65', port: 8080, path: '/onvif/device_service' },
    });

    const webShareStore = createWebShareStore({ configDir });
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 0x42), Buffer.from([0xff, 0xd9])]);
    let lastControl = null;

    const web = createCameraWebServer({
      cameraStore,
      webShareStore,
      fetchFn: async (url) => {
        if (url.endsWith('/api/status')) {
          return Buffer.from(JSON.stringify({
            app: 'robos-ip-camera',
            room: 'Living Room',
            live: true,
            batteryPercent: 82,
            charging: true,
            temperatureC: 32.5,
            motion: false,
            torchEnabled: true,
          }));
        }
        return fakeJpeg;
      },
      postFn: async (_url, payload) => {
        lastControl = payload;
        return { status: 200, body: '{"ok":true}' };
      },
    });

    const info = await web.listen(0, '127.0.0.1');
    try {
      const cfHeaders = {
        'cf-connecting-ip': '203.0.113.42',
        'cf-ray': '8899aabbccddeeff-ORD',
        'x-forwarded-proto': 'https',
      };

      // 1. Unauthenticated Cloudflare visitor gets 401 Protected by Google Login
      const blocked = await httpRequest(`${info.localUrl}/`, { headers: cfHeaders });
      assert.strictEqual(blocked.status, 401);
      assert.match(blocked.body.toString('utf8'), /Protected by Google Login/);

      const blockedApi = await httpRequest(`${info.localUrl}/api/cameras/${savedCam.id}/frame.jpg`, { headers: cfHeaders });
      assert.strictEqual(blockedApi.status, 401);

      // 2. Clicking the Google Doc ?auth=<256-bit-key> link sets a 1-year HttpOnly; Secure; SameSite=Lax cookie and 302 redirects to /
      const ws = webShareStore.load();
      assert.match(ws.authToken, /^[0-9a-f]{64}$/);
      const exchange = await httpRequest(`${info.localUrl}/?auth=${ws.authToken}`, { headers: cfHeaders });
      assert.strictEqual(exchange.status, 302);
      assert.strictEqual(exchange.headers.location, '/');
      const setCookie = Array.isArray(exchange.headers['set-cookie']) ? exchange.headers['set-cookie'][0] : exchange.headers['set-cookie'];
      assert.match(setCookie, /robos_cam_session=/);
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /Max-Age=31536000/);
      const sessionPair = setCookie.split(';')[0];

      // 3. With the session cookie, Web Browser Mode, telemetry, frame proxy and remote controls all succeed!
      const authedHeaders = { ...cfHeaders, cookie: sessionPair };
      const page = await httpRequest(`${info.localUrl}/`, { headers: authedHeaders });
      assert.strictEqual(page.status, 200);
      assert.match(page.body.toString('utf8'), /XT2125-4 Camera/);
      assert.match(page.body.toString('utf8'), /pumpFrames/);

      const camsRes = await httpRequest(`${info.localUrl}/api/cameras`, { headers: authedHeaders });
      assert.strictEqual(camsRes.status, 200);
      const camsJson = JSON.parse(camsRes.body.toString('utf8'));
      assert.strictEqual(camsJson.cameras[0].room, 'Living Room');
      assert.strictEqual(camsJson.cameras[0].batteryPercent, 82);

      const frameRes = await httpRequest(`${info.localUrl}/api/cameras/${savedCam.id}/frame.jpg`, { headers: authedHeaders });
      assert.strictEqual(frameRes.status, 200);
      assert.strictEqual(frameRes.headers['content-type'], 'image/jpeg');
      assert.deepStrictEqual(frameRes.body, fakeJpeg);

      const ctrlRes = await httpRequest(`${info.localUrl}/api/cameras/${savedCam.id}/control`, {
        method: 'POST',
        headers: { ...authedHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ toggleTorch: true }),
      });
      assert.strictEqual(ctrlRes.status, 200);
      assert.deepStrictEqual(lastControl, { toggleTorch: true });

      // 4. Rotating the 256-bit key immediately invalidates existing browser cookies!
      webShareStore.rotateToken();
      const revoked = await httpRequest(`${info.localUrl}/`, { headers: authedHeaders });
      assert.strictEqual(revoked.status, 401);
    } finally {
      await web.close();
    }
  });

  it('renders a clean Google Doc HTML page with the Cloudflare HTTPS 1-tap launch callout', () => {
    const html = renderCameraGoogleDocHtml({
      cameras: [{ id: 'cam-1', name: 'XT2125-4 Camera', room: 'Living Room' }],
      authedTunnelUrl: 'https://demo-camera.trycloudflare.com/?auth=abcdef123456',
      publicTunnelUrl: 'https://demo-camera.trycloudflare.com',
      ownerEmail: 'nicholas.dipiazza@gmail.com',
    });
    assert.match(html, /CLICK HERE TO WATCH LIVE CAMERA IN YOUR BROWSER/);
    assert.match(html, /https:\/\/demo-camera\.trycloudflare\.com\/\?auth=abcdef123456/);
    assert.match(html, /XT2125-4 Camera/);
  });
});
