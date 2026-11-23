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
      const pageHtml = page.body.toString('utf8');
      assert.match(pageHtml, /XT2125-4 Camera/);
      assert.match(pageHtml, /pumpFrames/);
      assert.match(pageHtml, /stage-battery/);
      assert.match(pageHtml, /On Battery/);
      assert.match(pageHtml, /!cam\.charging/);
      assert.match(pageHtml, /yt-fs-btn/);
      assert.match(pageHtml, /bindStageDoubleTap/);

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

  it('lists RobOS users and shares & revokes Google Drive Camera Doc permissions via /api/robos-users', async () => {
    const configDir = path.join(tmpHome, 'cfg-users');
    const peopleDir = path.join(configDir, 'people');
    fs.mkdirSync(peopleDir, { recursive: true });
    fs.writeFileSync(path.join(peopleDir, 'nicholas-dipiazza.json'), JSON.stringify({
      uid: 'nicholas-dipiazza',
      displayName: 'Nicholas DiPiazza',
      email: 'owner.test@gmail.com',
      avatar: '🧙‍♂️',
      groups: ['Household'],
    }, null, 2));
    fs.writeFileSync(path.join(peopleDir, 'diana-arrington.json'), JSON.stringify({
      uid: 'diana-arrington',
      displayName: 'Diana Arrington',
      email: 'diana.test@gmail.com',
      avatar: '🛡️',
      groups: ['Family', 'Household'],
    }, null, 2));

    const cameraStore = createStore({ configDir, homeDir: tmpHome });
    cameraStore.saveCamera({
      name: 'XT2125-4 Camera',
      kind: 'onvif',
      streamUrl: 'http://192.168.1.65:8080/video',
      snapshotUrl: 'http://192.168.1.65:8080/snapshot.jpg',
      onvif: { hostname: '192.168.1.65', port: 8080, path: '/onvif/device_service' },
    });

    const webShareStore = createWebShareStore({ configDir });
    webShareStore.save({
      publicTunnelUrl: 'https://camera-demo.trycloudflare.com',
      ownerEmail: 'owner.test@gmail.com',
    });

    // Mock Google Drive REST v3 endpoints completely in-memory (zero real emails or network calls)
    const drivePermissions = [
      { id: 'perm-owner', emailAddress: 'owner.test@gmail.com', role: 'owner', type: 'user' },
    ];
    const driveCalls = [];

    const mockDriveFetch = async (rawUrl, init = {}) => {
      const u = new URL(String(rawUrl));
      const method = (init.method || 'GET').toUpperCase();
      driveCalls.push({ method, pathname: u.pathname, search: u.search, body: init.body });

      const jsonRes = (status, obj) => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => obj,
        text: async () => JSON.stringify(obj),
      });

      if (method === 'GET' && u.pathname === '/drive/v3/files') {
        return jsonRes(200, { files: [] });
      }
      if (method === 'POST' && u.pathname === '/drive/v3/files') {
        return jsonRes(200, { id: 'folder-123', name: 'RobOS Camera Watch' });
      }
      if (method === 'GET' && u.pathname.startsWith('/drive/v3/files/') && !u.pathname.endsWith('/permissions')) {
        return jsonRes(200, { id: u.pathname.split('/').pop(), name: 'RobOS Camera Watch' });
      }
      if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
        return jsonRes(200, { id: 'doc-xyz-789', name: 'XT2125-4 Camera — RobOS Live Camera' });
      }
      if (method === 'PATCH' && u.pathname.startsWith('/upload/drive/v3/files/')) {
        return jsonRes(200, { id: 'doc-xyz-789', modifiedTime: new Date().toISOString() });
      }
      if (method === 'GET' && u.pathname === '/drive/v3/files/doc-xyz-789/permissions') {
        return jsonRes(200, { permissions: [...drivePermissions] });
      }
      if (method === 'POST' && u.pathname === '/drive/v3/files/doc-xyz-789/permissions') {
        const parsed = JSON.parse(String(init.body || '{}'));
        const created = {
          id: `perm-${drivePermissions.length + 1}`,
          emailAddress: parsed.emailAddress,
          role: parsed.role,
          type: parsed.type,
        };
        drivePermissions.push(created);
        return jsonRes(200, created);
      }
      if (method === 'DELETE' && u.pathname.startsWith('/drive/v3/files/doc-xyz-789/permissions/')) {
        const permId = u.pathname.split('/').pop();
        const idx = drivePermissions.findIndex((p) => p.id === permId);
        if (idx >= 0) drivePermissions.splice(idx, 1);
        return { ok: true, status: 204, json: async () => null, text: async () => '' };
      }
      return jsonRes(404, { error: { message: `Unhandled ${method} ${u.pathname}` } });
    };

    const web = createCameraWebServer({
      cameraStore,
      webShareStore,
      googleDriveOptions: {
        configDir,
        homeDir: tmpHome,
        tokens: { get: async () => 'fake-oauth-token' },
        fetchImpl: mockDriveFetch,
      },
    });

    const info = await web.listen(0, '127.0.0.1');
    try {
      // 1. Unproxied LAN hub discovery answers 200; Cloudflare-proxied probe gets 401
      const hubOk = await httpRequest(`${info.localUrl}/api/robos-camera-hub`);
      assert.strictEqual(hubOk.status, 200);
      assert.strictEqual(JSON.parse(hubOk.body.toString('utf8')).app, 'robos-camera-watch-web');

      const hubBlocked = await httpRequest(`${info.localUrl}/api/robos-camera-hub`, {
        headers: { 'cf-connecting-ip': '198.51.100.7', 'cf-ray': 'abc' },
      });
      assert.strictEqual(hubBlocked.status, 401);

      // 2. Web viewer HTML renders the prominent "Share with RobOS User" button
      const viewerHtml = (await httpRequest(`${info.localUrl}/`)).body.toString('utf8');
      assert.match(viewerHtml, /btn-share-robos-user/);
      assert.match(viewerHtml, /Share with RobOS User/);

      // 3. Authenticate a Cloudflare browser session (and a second guest cookie to verify key rotation on revoke)
      const cfHeaders = { 'cf-connecting-ip': '198.51.100.9', 'cf-ray': 'def', 'x-forwarded-proto': 'https' };
      const initialToken = webShareStore.load().authToken;
      const exch = await httpRequest(`${info.localUrl}/?auth=${initialToken}`, { headers: cfHeaders });
      const ownerCookie = (Array.isArray(exch.headers['set-cookie']) ? exch.headers['set-cookie'][0] : exch.headers['set-cookie']).split(';')[0];
      const guestCookie = ownerCookie; // another browser holding the pre-revoke session cookie

      // 4. GET /api/robos-users over Cloudflare masks emails while preserving uids
      const listRes = await httpRequest(`${info.localUrl}/api/robos-users`, {
        headers: { ...cfHeaders, cookie: ownerCookie },
      });
      assert.strictEqual(listRes.status, 200);
      const listJson = JSON.parse(listRes.body.toString('utf8'));
      const dianaBefore = listJson.users.find((u) => u.uid === 'diana-arrington');
      assert.ok(dianaBefore);
      assert.strictEqual(dianaBefore.email, 'di***@gmail.com');
      assert.strictEqual(dianaBefore.canShare, true);
      assert.strictEqual(dianaBefore.shared, false);

      // 5. POST /api/robos-users/share with { uid: 'diana-arrington' } creates/updates Google Doc & grants Drive reader access
      const shareRes = await httpRequest(`${info.localUrl}/api/robos-users/share`, {
        method: 'POST',
        headers: { ...cfHeaders, cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ uid: 'diana-arrington' }),
      });
      assert.strictEqual(shareRes.status, 200);
      const shareJson = JSON.parse(shareRes.body.toString('utf8'));
      assert.strictEqual(shareJson.docId, 'doc-xyz-789');
      assert.match(shareJson.docUrl, /docs\.google\.com\/document\/d\/doc-xyz-789\/edit/);
      const dianaAfter = shareJson.users.find((u) => u.uid === 'diana-arrington');
      assert.strictEqual(dianaAfter.shared, true);
      assert.strictEqual(dianaAfter.permissionId, 'perm-2');

      const permPost = driveCalls.find((c) => c.method === 'POST' && c.pathname === '/drive/v3/files/doc-xyz-789/permissions');
      assert.ok(permPost);
      assert.deepStrictEqual(JSON.parse(permPost.body), {
        type: 'user',
        role: 'reader',
        emailAddress: 'diana.test@gmail.com',
      });

      // 6. POST /api/robos-users/revoke deletes the Google Drive permission, rotates the 256-bit key,
      //    invalidates the revoked viewer's cookie, and refreshes the caller's own Set-Cookie!
      const revokeRes = await httpRequest(`${info.localUrl}/api/robos-users/revoke`, {
        method: 'POST',
        headers: { ...cfHeaders, cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ uid: 'diana-arrington', permissionId: 'perm-2' }),
      });
      assert.strictEqual(revokeRes.status, 200);
      const revokeJson = JSON.parse(revokeRes.body.toString('utf8'));
      assert.strictEqual(revokeJson.users.find((u) => u.uid === 'diana-arrington').shared, false);

      // Old browser cookie is immediately rejected with 401
      const oldSessionTry = await httpRequest(`${info.localUrl}/api/cameras`, {
        headers: { ...cfHeaders, cookie: guestCookie },
      });
      assert.strictEqual(oldSessionTry.status, 401);

      // Caller's refreshed Set-Cookie continues working seamlessly
      const refreshedCookie = (Array.isArray(revokeRes.headers['set-cookie']) ? revokeRes.headers['set-cookie'][0] : revokeRes.headers['set-cookie']).split(';')[0];
      const callerStillAuthed = await httpRequest(`${info.localUrl}/api/cameras`, {
        headers: { ...cfHeaders, cookie: refreshedCookie },
      });
      assert.strictEqual(callerStillAuthed.status, 200);
    } finally {
      await web.close();
    }
  });
});
