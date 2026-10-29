'use strict';

/**
 * Preferences → Cloud Suite Accounts: removing an account.
 *
 * A failed sign-in once left a placeholder "user@gmail.com" Google account behind, mirrored
 * from a Google Drive entry in data-sources.json. Removing it must ask first, drop the linked
 * data source too (or syncFromDataSources recreates the account on the next read), and leave
 * other accounts alone. It must still be gone after Preferences is reopened.
 */

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { launchApp, killApp, setupHome } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');

const BOGUS = 'google-user-gmail-com';
const REAL = 'google-alex-rivera-example-com';
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-cloud-remove-e2e-'));
const configFile = name => path.join(HOME, '.config', 'robos', name);
const readJson = name => JSON.parse(fs.readFileSync(configFile(name), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function seedHome() {
  setupHome(HOME, {});
  const files = {
    'cloud-accounts.json': {
      version: 1,
      defaultAccountId: BOGUS,
      accounts: [
        { id: BOGUS, provider: 'google', email: 'user@gmail.com', accessToken: 'tok-bogus', loggedIn: true, linkedDataSourceIds: ['gdrive-user-gmail-com'] },
        { id: REAL, provider: 'google', email: 'alex.rivera@example.com', accessToken: 'tok-alex', loggedIn: true, linkedDataSourceIds: ['gdrive-alex-drive'] },
      ],
    },
    'data-sources.json': [
      { id: 'gdrive-user-gmail-com', name: 'My Google Drive', driverType: 'gdrive', category: 'storage', user: 'user@gmail.com', accessToken: 'tok-bogus', loggedIn: true, authStatus: 'authenticated' },
      { id: 'gdrive-alex-drive', name: 'Alex Google Drive', driverType: 'gdrive', category: 'storage', user: 'alex.rivera@example.com', accessToken: 'tok-alex', loggedIn: true, authStatus: 'authenticated' },
      { id: 'sftp-basement-nas', name: 'Basement NAS', driverType: 'sftp', category: 'storage', host: 'nas.local', user: 'alex' },
    ],
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(configFile(name), JSON.stringify(content, null, 2));
  }
}

async function openPreferences() {
  const app = await launchApp('robos-preferences', { name: 'cloud-accounts-remove', home: HOME, env: { ROBOS_TEST: '1' } });
  await evalJS(app.port, `document.getElementById('sidebar-item-cloud_accounts').click()`);
  await waitFor(app, `document.querySelectorAll('.cloud-account-row').length > 0`, 'cloud account rows to render');
  return app;
}

async function waitFor(app, expr, what, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evalJS(app.port, `Boolean(${expr})`)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const rowIds = app => evalJS(app.port, `[...document.querySelectorAll('.cloud-account-row')].map(r => r.dataset.cloudId)`);
const isShown = (app, selector) => evalJS(app.port, `(() => { const el = document.querySelector('${selector}'); return Boolean(el) && getComputedStyle(el).display !== 'none'; })()`);
const click = (app, selector) => evalJS(app.port, `document.querySelector('${selector}').click()`);

describe('Preferences: remove a cloud account', () => {
  after(() => fs.rmSync(HOME, { recursive: true, force: true }));

  it('asks to confirm, removes the account and its data source, and it stays gone after reopening', async () => {
    seedHome();
    let app = await openPreferences();
    try {
      assert.deepStrictEqual((await rowIds(app)).sort(), [BOGUS, REAL].sort());

      // Remove asks first; Cancel keeps the account.
      await click(app, `[data-cloud-remove="${BOGUS}"]`);
      assert.ok(await isShown(app, `[data-cloud-confirm="${BOGUS}"]`), 'confirmation must appear');
      const prompt = await evalJS(app.port, `document.querySelector('[data-cloud-confirm="${BOGUS}"]').textContent`);
      assert.match(prompt, /Remove user@gmail\.com and its Data Sources connection\?/);
      await click(app, `[data-cloud-remove-cancel="${BOGUS}"]`);
      assert.ok(!(await isShown(app, `[data-cloud-confirm="${BOGUS}"]`)), 'Cancel hides the confirmation');
      assert.ok(readJson('cloud-accounts.json').accounts.some(a => a.id === BOGUS), 'Cancel must not remove the account');

      // Remove, then confirm.
      await click(app, `[data-cloud-remove="${BOGUS}"]`);
      await click(app, `[data-cloud-remove-confirm="${BOGUS}"]`);
      await waitFor(app, `!document.querySelector('[data-cloud-id="${BOGUS}"]')`, 'the removed row to disappear');
      assert.deepStrictEqual(await rowIds(app), [REAL]);
      const status = await evalJS(app.port, `document.getElementById('cloud-accounts-status').textContent`);
      assert.match(status, /Removed user@gmail\.com/);
    } finally {
      await killApp(app);
    }

    const accounts = readJson('cloud-accounts.json');
    assert.deepStrictEqual(accounts.accounts.map(a => a.id), [REAL]);
    assert.strictEqual(accounts.defaultAccountId, REAL, 'the remaining account becomes the default');
    assert.deepStrictEqual(readJson('data-sources.json').map(ds => ds.id), ['gdrive-alex-drive', 'sftp-basement-nas'],
      'only the removed account\'s Drive data source is dropped');

    // Reopening re-reads data-sources.json through syncFromDataSources; the account must not come back.
    app = await openPreferences();
    try {
      assert.deepStrictEqual(await rowIds(app), [REAL]);
      const listed = await evalJS(app.port, `window.api.cloudAccounts().then(r => r.accounts.map(a => a.id))`);
      assert.deepStrictEqual(listed, [REAL]);
    } finally {
      await killApp(app);
    }
    assert.deepStrictEqual(readJson('cloud-accounts.json').accounts.map(a => a.id), [REAL]);
  });
});
