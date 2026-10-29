'use strict';

// End to end: the JRPG Parse Portal app acquires Dragon Warrior into a kgraph
// folder and builds its Pages site; the built site renders each node with its
// own, its parent type's or the generic renderer in a real browser; KGraph
// Explorer's Pages Site dialog builds the same site from the folder.
//
// Run under a display:  xvfb-run -a node --test tests/jrpg-parse-portal/portal.e2e.js
// Proof screenshots go to packages/robos-test/run/jrpg-parse-portal/.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pw;
try { pw = require('playwright-core'); } catch { pw = require('playwright'); }
const { _electron: electron, chromium } = pw;

const PACKAGES = path.resolve(__dirname, '../../..');
const site = require(path.join(PACKAGES, 'robos-graph/lib/pages-site'));
const portal = require(path.join(PACKAGES, 'jrpg-parse-portal/lib/portal'));
const proof = path.resolve(__dirname, '../../run/jrpg-parse-portal');
const electronBin = () => process.env.ELECTRON_BIN || require('electron');
const ELECTRON_ARGS = ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-e2e-')); fs.mkdirSync(proof, { recursive: true }); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('JRPG Parse Portal acquires Dragon Warrior and builds its Pages site', { timeout: 120000 }, async () => {
  const out = path.join(tmp, 'portal', 'kgraph-dragon-warrior');
  const app = await electron.launch({ executablePath: electronBin(), args: [path.join(PACKAGES, 'jrpg-parse-portal'), ...ELECTRON_ARGS], env: { ...process.env, HOME: path.join(tmp, 'home'), ROBOS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('.profile[data-id="dragon-warrior-usa"]').click();
    await page.locator('#game-head h2', { hasText: 'Dragon Warrior' }).waitFor();
    assert.equal(await page.locator('#plan-grid .asset').count(), 17, 'one card per asset type');
    await page.screenshot({ path: path.join(proof, '01-plan.png') });

    await page.locator('#tab-acquire').click();
    await page.locator('#out-dir').fill(out);
    await page.locator('#opt-discovery').uncheck();
    await page.locator('#btn-acquire').click();
    await page.locator('#acquire-status.ok').waitFor({ timeout: 60000 });
    assert.match(await page.locator('#acquire-status').textContent(), /307 nodes in 11 packages/);
    assert.equal(await page.locator('#coverage-grid .asset.covered').count(), 17);
    await page.screenshot({ path: path.join(proof, '02-acquired.png') });

    await page.locator('#tab-publish').click();
    await page.locator('#btn-build-site').click();
    await page.locator('#publish-status.ok').waitFor({ timeout: 30000 });
    const rows = await page.locator('#resolution-table tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
    const boss = rows.find(r => r[0] === 'jrpg:Boss');
    assert.deepEqual([boss[2], boss[3]], ['jrpg-enemy', 'parent type jrpg:Enemy']);
    assert.equal(rows.find(r => r[0] === 'jrpg:Source')[2], 'generic');
    assert.ok(fs.existsSync(path.join(out, 'docs', 'index.html')));
    assert.ok(fs.existsSync(path.join(out, '.github', 'workflows', 'kgraph-pages.yml')));
    await page.screenshot({ path: path.join(proof, '03-published.png') });
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});

test('the built site draws each node with its own, its parent type\'s or the generic renderer', { timeout: 90000 }, async () => {
  const dir = path.join(tmp, 'site', 'kgraph-dragon-warrior');
  await portal.acquire({ profileId: 'dragon-warrior-usa', outDir: dir });
  const built = site.buildKgraphSite({ graphDir: dir });
  const { server, url } = await site.serveSite(built.outDir);
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? {} : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const visit = async (hash, shot) => {
      await page.goto(url + hash);
      await page.waitForSelector('html[data-ready="true"]');
      if (shot) await page.screenshot({ path: path.join(proof, shot) });
      return page.locator('.renderer-note').evaluate(n => ({ renderer: n.dataset.renderer, via: n.dataset.via }));
    };
    const node = id => `#/node/${encodeURIComponent(`urn:robos:jrpg:dragon-warrior:${id}`)}`;

    assert.deepEqual(await visit('', '10-site-home.png'), { renderer: 'jrpg-game', via: 'type' });
    assert.equal(await page.locator('.coverage a').count(), 17);

    assert.deepEqual(await visit(node('enemy:dragonlord-form2'), '11-site-boss.png'), { renderer: 'jrpg-enemy', via: 'parent' });
    assert.equal(await page.locator('.stat').first().locator('.k').textContent(), 'HP');

    assert.deepEqual(await visit(node('source:ryan8bit')), { renderer: 'generic', via: 'generic' });

    assert.deepEqual(await visit(`#/type/${encodeURIComponent('jrpg:Enemy')}`, '12-site-bestiary.png'), { renderer: 'jrpg-enemy', via: 'type' });
    assert.equal(await page.locator('table.data tbody tr').count(), 40, 'bosses are listed with the enemies');

    assert.deepEqual(await visit(`#/type/${encodeURIComponent('jrpg:StoryMilestone')}`, '13-site-story.png'), { renderer: 'jrpg-milestone', via: 'type' });
    assert.ok(await page.locator('.timeline li').count() >= 70);

    assert.deepEqual(await visit(node('map:world'), '14-site-map.png'), { renderer: 'jrpg-map', via: 'parent' });
    await page.waitForFunction(() => { const i = document.querySelector('.map-frame img'); return i && i.complete && i.naturalWidth > 0; });

    await page.goto(`${url}#/search/slime`);
    await page.waitForSelector('html[data-ready="true"]');
    assert.ok(await page.locator('.grid .card').count() >= 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});

test('KGraph Explorer builds the Pages site from its workspace folder', { timeout: 120000 }, async () => {
  const dir = path.join(tmp, 'explorer', 'kgraph-dragon-warrior');
  await portal.acquire({ profileId: 'dragon-warrior-usa', outDir: dir });
  const app = await electron.launch({ executablePath: electronBin(), args: [path.join(PACKAGES, 'robos-graph/main.js'), ...ELECTRON_ARGS], env: { ...process.env, ROBOS_GRAPH_ROOT: dir, ROBOS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('#btn-open-pages-site').click();
    await page.locator('#pages-site-modal').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('pages-graph-dir').value.length > 0);
    assert.equal(await page.locator('#pages-graph-dir').inputValue(), dir);
    await page.locator('#btn-pages-build').click();
    await page.locator('#pages-status.ok').waitFor({ timeout: 30000 });
    assert.match(await page.locator('#pages-status').textContent(), /Built 307 nodes/);
    assert.ok(await page.locator('#pages-resolution tr.via-parent').count() >= 10);
    await page.screenshot({ path: path.join(proof, '20-explorer-pages-site.png') });
    assert.ok(fs.existsSync(path.join(dir, 'docs', 'data', 'graph.json')));
    assert.deepEqual(errors, []);
  } finally { await app.close(); }
});
