'use strict';

/**
 * Config Sync, through RobOS Preferences: the panel tells the truth about background sync, and a
 * person with a damaged file can get the vault's copy back, with or without disconnecting.
 *
 * Runs against a local folder vault in a sandbox HOME.
 *
 *   Xvfb :99 &  ROBOS_TEST=1 node --test tests/robos-preferences/config-sync-recovery-e2e.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { launchApp, killApp, setupHome } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const sync = require('../../../robos-lib/config-sync');

const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-config-recovery-e2e-'));
const HOME = path.join(RUN, 'home');
const VAULT = path.join(RUN, 'Dropbox', 'RobOS Config Vault');
const STORE = path.join(HOME, '.config/robos/point-of-sale/store.json');
const REL = 'config/point-of-sale/store.json';
const AGENT = path.join(HOME, '.config/robos/config-sync/agent.json');
const ORDERS = Array.from({ length: 80 }, (_, i) => ({ id: `o${i}`, total: 8.16 }));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = s => JSON.stringify(s);
const orders = () => JSON.parse(fs.readFileSync(STORE, 'utf8')).orders.length;
const damage = () => fs.writeFileSync(STORE, 'garbage, not a shop');

async function until(port, expr, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await evalJS(port, `(() => { try { return ${expr}; } catch { return false; } })()`)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expr}\nConfig Sync status: ${await evalJS(port, `document.getElementById('cs-status')?.textContent`)}`);
}
const text = (port, sel) => evalJS(port, `document.querySelector(${q(sel)})?.textContent || ''`);
async function click(port, sel) {
  const r = await evalJS(port, `(() => { const el = document.querySelector(${q(sel)}); if (!el) return false; el.click(); return true; })()`);
  assert.ok(r, `nothing to click at ${sel}`);
}

describe('Config Sync recovery in RobOS Preferences', () => {
  let app;

  before(async () => {
    setupHome(HOME, {});
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify({ orders: ORDERS }, null, 2));
    fs.mkdirSync(path.dirname(VAULT), { recursive: true });
    await sync.connectVault({ homeDir: HOME, create: { kind: 'folder', path: path.dirname(VAULT), name: path.basename(VAULT) } });
    await sync.applyVaultSync({ homeDir: HOME, strategy: 'use-local' });
    app = await launchApp('robos-preferences', { name: 'config-sync-recovery', home: HOME, env: { ROBOS_TEST: '1' } });
    await until(app.port, `Boolean(window.cs && window.cs.status && document.getElementById('cs-auto'))`);
  });

  after(async () => {
    if (app) await killApp(app);
    fs.rmSync(RUN, { recursive: true, force: true });
  });

  it('says background sync is not running when nothing is running it, and says who runs it when something is', async () => {
    assert.strictEqual(await evalJS(app.port, `document.getElementById('cs-auto-enabled').checked`), true);
    assert.strictEqual(await evalJS(app.port, `document.getElementById('cs-agent').dataset.state`), 'stopped');
    const stopped = await text(app.port, '#cs-auto');
    assert.match(stopped, /Background sync is not running on this computer/);
    assert.match(stopped, /only when you press Sync now/);
    assert.doesNotMatch(stopped, /even with Preferences closed/);

    // This test process stands in for Desktop Manager, which the main e2e runs for real.
    const now = new Date().toISOString();
    fs.writeFileSync(AGENT, JSON.stringify({ host: 'desktop-manager', pid: process.pid, startedAt: now, beatAt: now }));
    await evalJS(app.port, `csRefresh().then(() => true)`);
    await until(app.port, `document.getElementById('cs-agent').dataset.state === 'running'`);
    assert.match(await text(app.port, '#cs-agent'), /Background sync is running in Desktop Manager/);

    fs.rmSync(AGENT);
    await evalJS(app.port, `csRefresh().then(() => true)`);
    await until(app.port, `document.getElementById('cs-agent').dataset.state === 'stopped'`);

    // With nothing running it, saving the setting does not claim that syncing will happen.
    await evalJS(app.port, `(() => { const el = document.getElementById('cs-auto-interval'); el.value = '15'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await until(app.port, `/not running on this computer right now/.test(document.getElementById('cs-status').textContent)`);
    await evalJS(app.port, `(() => { const el = document.getElementById('cs-auto-interval'); el.value = '5'; el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await until(app.port, `/every 5 min/.test(document.getElementById('cs-status').textContent)`);
  });

  it('flags a damaged file, will not upload it, and loads the vault without disconnecting', async () => {
    damage();
    await click(app.port, '#cs-review');
    await until(app.port, `Boolean(document.getElementById('cs-suspects'))`);
    const warning = await text(app.port, '#cs-suspects');
    assert.match(warning, /1 file on this machine may be damaged/);
    assert.match(warning, /point-of-sale\/store\.json/);
    assert.match(warning, /no longer valid JSON/);
    assert.strictEqual(await evalJS(app.port, `document.getElementById('cs-apply').disabled`), true, 'Apply waits for a choice');

    await click(app.port, '#cs-sync');
    await until(app.port, `/Choose which version to keep/.test(document.getElementById('cs-status').textContent)`);
    assert.strictEqual(sync.getVault({ homeDir: HOME }).lastGeneration, 1, 'Sync now uploaded nothing');

    assert.match(await text(app.port, '#cs-recover'), /uploads nothing/);
    await click(app.port, '#cs-load-vault');
    await until(app.port, `/Click again/.test(document.getElementById('cs-load-vault').textContent)`);
    assert.throws(orders, 'the first click changes nothing');
    await click(app.port, '#cs-load-vault');
    await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
    assert.strictEqual(orders(), 80);
    assert.strictEqual(sync.getVault({ homeDir: HOME }).lastGeneration, 1, 'the vault did not move');
    assert.strictEqual(sync.listRestorePoints({ homeDir: HOME })[0].files[0], REL, 'the damaged file is kept in a restore point');
  });

  it('restores one damaged file by choosing the vault copy for that row', async () => {
    damage();
    await click(app.port, '#cs-review');
    await until(app.port, `Boolean(document.querySelector(${q(`input[data-cs-res="${REL}"]`)}))`);
    await click(app.port, `input[data-cs-res="${REL}"][value="remote"]`);
    await until(app.port, `!document.getElementById('cs-apply').disabled`);
    await click(app.port, '#cs-apply');
    await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
    assert.strictEqual(orders(), 80);
  });

  it('after Disconnect and reconnect, recommends loading the vault when a file looks damaged', async () => {
    damage();
    await click(app.port, '#cs-disconnect');
    await until(app.port, `/Click again/.test(document.getElementById('cs-disconnect').textContent)`);
    await click(app.port, '#cs-disconnect');
    await until(app.port, `Boolean(document.getElementById('cs-connect'))`);

    await evalJS(app.port, `(() => { const s = document.getElementById('cs-connect-account'); s.value = ''; document.getElementById('cs-connect-ref').value = ${q(VAULT)}; return true; })()`);
    await click(app.port, '#cs-connect');
    await until(app.port, `Boolean(document.getElementById('cs-first-sync'))`);
    assert.strictEqual(await evalJS(app.port, `cs.plan.recommended`), 'use-vault');
    assert.strictEqual(await evalJS(app.port, `document.querySelector('input[name="cs-strategy"]:checked').value`), 'use-vault');
    assert.match(await text(app.port, '.cs-strategy.active'), /Load the vault onto this machine\s*Recommended/);
    assert.match(await text(app.port, '#cs-suspects'), /no longer valid JSON/);

    await click(app.port, '#cs-apply');
    await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
    assert.strictEqual(orders(), 80);
  });
});
