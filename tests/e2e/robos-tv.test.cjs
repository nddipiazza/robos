'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const {
  TV_PLATFORMS,
  TEN_FOOT_LAUNCH_TILES,
  generateSideloadPackage,
  createTvEngine,
} = require('../../packages/robos-lib/tv-engine');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('RobOS Smart TV Studio & 10-Foot Portal E2E Verification', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-tv-test-'));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('1. Supports all 5 first-class Smart TV platforms & 8 10-foot experiences', () => {
    assert.equal(TV_PLATFORMS.length, 5);
    const ids = TV_PLATFORMS.map((p) => p.id);
    assert.deepEqual(ids, [
      'roku-os',
      'android-tv',
      'lg-webos',
      'samsung-tizen',
      'moonlight-sunshine',
    ]);
    for (const p of TV_PLATFORMS) {
      assert.ok(Array.isArray(p.requiredPermissions) && p.requiredPermissions.length > 0, `Missing requiredPermissions for ${p.id}`);
    }
    assert.equal(TEN_FOOT_LAUNCH_TILES.length, 8);
  });

  await t.test('2. Generates valid Developer Mode sideload bundles for LG webOS, Samsung Tizen, Android TV & Roku', () => {
    const outDir = path.join(tmpDir, 'packages');

    const webos = generateSideloadPackage({
      platformId: 'lg-webos',
      outputDir: outDir,
      hostIp: '192.168.1.100',
      portalPort: 19210,
      tvIp: '192.168.1.64',
      webosPassphrase: 'A9F31C',
    });
    assert.equal(webos.ok, true);
    assert.ok(fs.existsSync(path.join(webos.targetDir, 'appinfo.json')));
    assert.ok(fs.existsSync(path.join(webos.targetDir, 'index.html')));
    assert.ok(fs.existsSync(path.join(webos.targetDir, 'sideload-webos.sh')));
    const appInfo = JSON.parse(fs.readFileSync(path.join(webos.targetDir, 'appinfo.json'), 'utf8'));
    assert.equal(appInfo.id, 'com.robos.tv');
    const webosScript = fs.readFileSync(path.join(webos.targetDir, 'sideload-webos.sh'), 'utf8');
    assert.ok(webosScript.includes('ares-package'));
    assert.ok(webosScript.includes('ares-install'));
    assert.ok(webosScript.includes('ares-extend-dev'));

    const tizen = generateSideloadPackage({
      platformId: 'samsung-tizen',
      outputDir: outDir,
      hostIp: '192.168.1.100',
      portalPort: 19210,
      tvIp: '192.168.1.78',
    });
    assert.equal(tizen.ok, true);
    assert.ok(fs.existsSync(path.join(tizen.targetDir, 'config.xml')));
    const tizenXml = fs.readFileSync(path.join(tizen.targetDir, 'config.xml'), 'utf8');
    assert.ok(tizenXml.includes('robostv001.RobOSTV'));
    assert.ok(tizenXml.includes('http://tizen.org/privilege/tv.inputdevice'));

    const androidTv = generateSideloadPackage({
      platformId: 'android-tv',
      outputDir: outDir,
      hostIp: '192.168.1.100',
      portalPort: 19210,
      tvIp: '192.168.1.52',
    });
    assert.equal(androidTv.ok, true);
    assert.ok(fs.existsSync(path.join(androidTv.targetDir, 'AndroidManifest.xml')));
    const manifestXml = fs.readFileSync(path.join(androidTv.targetDir, 'AndroidManifest.xml'), 'utf8');
    assert.ok(manifestXml.includes('android.software.leanback'));
    assert.ok(manifestXml.includes('android.intent.category.LEANBACK_LAUNCHER'));

    const roku = generateSideloadPackage({
      platformId: 'roku-os',
      outputDir: outDir,
      hostIp: '192.168.1.100',
      portalPort: 19210,
      tvIp: '192.168.1.90',
    });
    assert.equal(roku.ok, true);
    assert.ok(fs.existsSync(path.join(roku.targetDir, 'manifest')));
    assert.ok(fs.existsSync(path.join(roku.targetDir, 'source/Main.brs')));
  });

  await t.test('3. Starts 10-Foot Smart TV Portal HTTP server, pairs TVs, and dispatches D-Pad spatial navigation', async () => {
    const engine = createTvEngine({ configDir: tmpDir, portalPort: 0 });
    const srv = await engine.startPortalServer(0);
    assert.equal(srv.ok, true);
    assert.ok(srv.port > 0);

    try {
      const statusRes = await httpGet(`http://127.0.0.1:${srv.port}/api/status`);
      assert.equal(statusRes.status, 200);
      const statusJson = JSON.parse(statusRes.body);
      assert.equal(statusJson.ok, true);
      assert.equal(statusJson.app, 'robos-tv-portal');
      assert.equal(statusJson.tiles.length, 8);

      const htmlRes = await httpGet(`http://127.0.0.1:${srv.port}/`);
      assert.equal(htmlRes.status, 200);
      assert.ok(htmlRes.body.includes('RobOS 10-Foot Smart TV Portal'));
      assert.ok(htmlRes.body.includes('Realm of Heroes cRPG'));

      // Pair a new TV
      const pairRes = engine.addOrUpdateTv({
        name: 'Patio Roku TV',
        ip: '192.168.1.91',
        platformId: 'roku-os',
      });
      assert.equal(pairRes.ok, true);
      assert.equal(pairRes.tvs.length, 5);

      // Navigate right on D-Pad
      const navRes = engine.sendRemoteKey({ key: 'DPAD_RIGHT' });
      assert.equal(navRes.ok, true);
      assert.equal(navRes.activeTileId, 'crpg-realm');

      // Renew LG webOS Developer Mode 1,000h timer
      const renewRes = engine.renewWebosDevSession();
      assert.equal(renewRes.ok, true);
      assert.equal(renewRes.remainingHours, 1000);

      // Cast Dev Central Dashboard to a Smart TV in the list
      const castRes = await engine.castDevCentralDashboard({
        tvId: 'tv-livingroom-tcl-roku',
        dashboard: {
          sprintName: 'Sprint 42 • 4d left',
          activeFeature: {
            code: 'FEAT-42',
            name: 'Multi-Step Dynamic Form Validation',
            status: 'IN_PROGRESS',
            repository: 'acme-corp/buildbarn-forms',
            service: 'forms-api',
            progressPct: 75,
          },
          kpis: {
            featureCode: 'FEAT-42',
            featureStatus: 'IN PROGRESS',
            tasksCount: 6,
            prsCount: 4,
            reviewsCount: 2,
            blockersCount: 1,
            ciHealth: '75%',
          },
          issues: [{ number: 201, title: 'Multi-Step Dynamic Form Submission', state: 'OPEN' }],
          prs: [{ number: 84, title: 'feat(forms-api): Multi-step dynamic form validation', reviewDecision: 'APPROVED' }],
          blockers: [{ label: 'Failed CI', text: 'PR #85: Session memory leak', severity: 'high' }],
        },
      });
      assert.equal(castRes.ok, true);
      assert.equal(castRes.castSession.active, true);
      assert.equal(castRes.castSession.tvName, '65" TCL Roku TV (Living room)');

      // Verify /dev-central 10-foot wallboard endpoint and /api/dev-central-cast
      const wbRes = await httpGet(`http://127.0.0.1:${srv.port}/dev-central`);
      assert.equal(wbRes.status, 200);
      assert.ok(wbRes.body.includes('RobOS Dev Central — Mission Control Wallboard'));
      assert.ok(wbRes.body.includes('65&quot; TCL Roku TV (Living room)'));
      assert.ok(wbRes.body.includes('FEAT-42'));

      const castApiRes = await httpGet(`http://127.0.0.1:${srv.port}/api/dev-central-cast`);
      assert.equal(castApiRes.status, 200);
      const castApiJson = JSON.parse(castApiRes.body);
      assert.equal(castApiJson.ok, true);
      assert.equal(castApiJson.cast.active, true);

      // Stop casting
      const stopRes = engine.stopDevCentralCast({ tvId: 'tv-livingroom-tcl-roku' });
      assert.equal(stopRes.ok, true);
      assert.equal(stopRes.devCentralCast.active, false);
    } finally {
      await engine.stopPortalServer();
    }
  });
});
