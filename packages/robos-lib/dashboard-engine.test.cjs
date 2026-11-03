'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderDashboardTvWallboardHtml } = require('./dashboard-engine');

test('the TV wallboard page has a script that parses', () => {
  const html = renderDashboardTvWallboardHtml({ hostIp: '127.0.0.1', portalPort: 19210, tvName: 'Test TV', tvIp: '192.0.2.1',
    resolvedDashboard: { id: 'test', title: 'Test', layout: 'grid', cards: [] } });
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length > 0);
  // A \n in the page's source becomes a real line break inside a string unless it is escaped twice.
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
});

test('a fresh profile shows no invented or personal data', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createDashboardEngine } = require('./dashboard-engine');
  const { createTvEngine } = require('./tv-engine');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-fresh-'));
  const savedEnv = { HOME: process.env.HOME, ROBOS_TEST: process.env.ROBOS_TEST };
  process.env.HOME = root;
  process.env.ROBOS_TEST = '1';
  try {
    const configDir = path.join(root, 'config');
    const repoDir = path.join(root, 'not-a-checkout');
    fs.mkdirSync(repoDir, { recursive: true });
    const engine = createDashboardEngine({ configDir, repoDir });
    const tvEngine = createTvEngine({ configDir });
    const data = {
      dashboards: engine.listDashboards().map((d) => engine.resolveDashboard(d.id)),
      devices: tvEngine.getSavedDevices(),
    };
    const text = JSON.stringify(data);
    for (const leak of [/\/home\/ndipiazza/, /192\.168\.1\.(15|52|55|64|78)\b/, /dipiazza@/i, /Nicolas DiPiazza/, /@hermetiq/i, /Eye Exam/, /Baldur/]) {
      assert.doesNotMatch(text, leak);
    }
    assert.deepEqual(data.devices, { tvs: [], tabloIp: process.env.ROBOS_TABLO_IP || '' });
    const cards = engine.resolveDashboard('daily-engineering-ops').dashboard.cards;
    const byType = (type) => cards.find((card) => card.widgetType === type).liveData;
    assert.equal(byType('git-commits').count, 0);
    assert.equal(byType('calendar-today').count, 0);
    assert.equal(byType('next-meeting-countdown').targetEpochSec, 0);
    assert.equal(byType('github-repo').sample, true);
  } finally {
    process.env.HOME = savedEnv.HOME;
    if (savedEnv.ROBOS_TEST === undefined) delete process.env.ROBOS_TEST;
    else process.env.ROBOS_TEST = savedEnv.ROBOS_TEST;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('saved TV settings still apply, and the Tablo client does not fall through to localhost', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { createTvEngine } = require('./tv-engine');
  const { getTabloStatus } = require('./tablo-client');
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-saved-tv-'));
  try {
    const tv = { id: 'tv-1', name: 'Saved Roku', ip: '192.0.2.15', platformId: 'roku-os' };
    fs.writeFileSync(path.join(configDir, 'tv-studio.json'), JSON.stringify({ tvs: [tv], tabloIp: '192.0.2.55' }));
    assert.deepEqual(createTvEngine({ configDir }).getSavedDevices(), { tvs: [tv], tabloIp: '192.0.2.55' });
    const noAddress = await getTabloStatus({ ip: ' ' });
    assert.equal(noAddress.ok, false);
    assert.match(noAddress.error, /No Tablo DVR address/);
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
});
