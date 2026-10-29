'use strict';

/**
 * Preferences → Cloud Suite Accounts: removing and signing out of an account.
 *
 * A failed sign-in once left a placeholder "user@gmail.com" Google account behind, mirrored
 * from a Google Drive entry in data-sources.json. Both actions have to reach that file too:
 * syncFromDataSources copies accounts and tokens back from it every time Preferences reads
 * the account list. Each scenario checks the result survives reopening Preferences.
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
const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-cloud-accounts-e2e-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function seedHome(name) {
  const home = path.join(RUN, name);
  setupHome(home, {});
  const files = {
    'cloud-accounts.json': {
      version: 1,
      defaultAccountId: BOGUS,
      accounts: [
        { id: BOGUS, provider: 'google', email: 'user@gmail.com', accessToken: 'tok-bogus', loggedIn: true, linkedDataSourceIds: ['gdrive-user-gmail-com'] },
        {
          id: REAL, provider: 'google', email: 'alex.rivera@example.com', loggedIn: true,
          accessToken: 'tok-alex', refreshToken: '1//refresh-alex', calendarAccessToken: 'cal-alex', calendarRefreshToken: '1//cal-refresh-alex',
          scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/calendar'],
          suites: { mail: { enabled: true } },
          linkedDataSourceIds: ['gdrive-alex-drive'],
          linkedFolders: [{ id: 'fld-movies', name: 'Movies' }],
        },
      ],
    },
    'data-sources.json': [
      { id: 'gdrive-user-gmail-com', name: 'My Google Drive', driverType: 'gdrive', category: 'storage', user: 'user@gmail.com', accessToken: 'tok-bogus', loggedIn: true, authStatus: 'authenticated' },
      { id: 'gdrive-alex-drive', name: 'Alex Google Drive', driverType: 'gdrive', category: 'storage', user: 'alex.rivera@example.com', accessToken: 'tok-alex', refreshToken: '1//refresh-alex', loggedIn: true, authStatus: 'authenticated', status: 'Connected', folders: [{ id: 'fld-movies', name: 'Movies' }] },
      { id: 'sftp-basement-nas', name: 'Basement NAS', driverType: 'sftp', category: 'storage', host: 'nas.local', user: 'alex' },
    ],
  };
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(home, '.config', 'robos', file), JSON.stringify(content, null, 2));
  }
  return {
    home,
    readJson: file => JSON.parse(fs.readFileSync(path.join(home, '.config', 'robos', file), 'utf8')),
  };
}

async function openPreferences(home) {
  const app = await launchApp('robos-preferences', { name: 'cloud-accounts', home, env: { ROBOS_TEST: '1' } });
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
const rowText = (app, id) => evalJS(app.port, `document.querySelector('[data-cloud-id="${id}"]').textContent.replace(/\\s+/g, ' ')`);
const exists = (app, selector) => evalJS(app.port, `Boolean(document.querySelector('${selector}'))`);
const isShown = (app, selector) => evalJS(app.port, `(() => { const el = document.querySelector('${selector}'); return Boolean(el) && getComputedStyle(el).display !== 'none'; })()`);
const click = (app, selector) => evalJS(app.port, `document.querySelector('${selector}').click()`);
const statusText = app => evalJS(app.port, `document.getElementById('cloud-accounts-status').textContent`);

describe('Preferences: Cloud Suite Accounts row actions', () => {
  after(() => fs.rmSync(RUN, { recursive: true, force: true }));

  it('Remove asks to confirm, drops the account and its data source, and it stays gone after reopening', async () => {
    const { home, readJson } = seedHome('remove');
    let app = await openPreferences(home);
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
      assert.match(await statusText(app), /Removed user@gmail\.com/);
    } finally {
      await killApp(app);
    }

    const accounts = readJson('cloud-accounts.json');
    assert.deepStrictEqual(accounts.accounts.map(a => a.id), [REAL]);
    assert.strictEqual(accounts.defaultAccountId, REAL, 'the remaining account becomes the default');
    assert.deepStrictEqual(readJson('data-sources.json').map(ds => ds.id), ['gdrive-alex-drive', 'sftp-basement-nas'],
      'only the removed account\'s Drive data source is dropped');

    // Reopening re-reads data-sources.json through syncFromDataSources; the account must not come back.
    app = await openPreferences(home);
    try {
      assert.deepStrictEqual(await rowIds(app), [REAL]);
      const listed = await evalJS(app.port, `window.api.cloudAccounts().then(r => r.accounts.map(a => a.id))`);
      assert.deepStrictEqual(listed, [REAL]);
    } finally {
      await killApp(app);
    }
    assert.deepStrictEqual(readJson('cloud-accounts.json').accounts.map(a => a.id), [REAL]);
  });

  it('Sign out clears the tokens here and in Data Sources, keeps the account, and stays signed out after reopening', async () => {
    const { home, readJson } = seedHome('sign-out');
    let app = await openPreferences(home);
    try {
      assert.match(await rowText(app, REAL), /Connected/);
      await click(app, `[data-cloud-signout="${REAL}"]`);
      await waitFor(app, `/Login Required/.test(document.querySelector('[data-cloud-id="${REAL}"]').textContent)`, 'the row to show Login Required');
      assert.ok(!(await exists(app, `[data-cloud-signout="${REAL}"]`)), 'a signed-out account has no Sign out button');
      assert.match(await statusText(app), /Signed out alex\.rivera@example\.com/);
      assert.match(await rowText(app, BOGUS), /Connected/, 'the other account stays signed in');
    } finally {
      await killApp(app);
    }

    const assertSignedOut = () => {
      const acc = readJson('cloud-accounts.json').accounts.find(a => a.id === REAL);
      assert.ok(acc, 'the account is kept');
      for (const field of ['accessToken', 'refreshToken', 'calendarAccessToken', 'calendarRefreshToken']) {
        assert.strictEqual(acc[field], '', `${field} is cleared`);
      }
      assert.strictEqual(acc.loggedIn, false);
      assert.strictEqual(acc.status, 'Login Required');
      assert.strictEqual(acc.suites.mail.enabled, true, 'suite choices are kept');
      assert.deepStrictEqual(acc.linkedFolders, [{ id: 'fld-movies', name: 'Movies' }], 'folders are kept');

      const dsList = readJson('data-sources.json');
      const ds = dsList.find(d => d.id === 'gdrive-alex-drive');
      assert.ok(ds, 'the data source is kept');
      assert.strictEqual(ds.accessToken, '');
      assert.strictEqual(ds.refreshToken, '');
      assert.strictEqual(ds.loggedIn, false);
      assert.strictEqual(ds.status, 'Login Required');
      assert.deepStrictEqual(ds.folders, [{ id: 'fld-movies', name: 'Movies' }]);
      assert.strictEqual(dsList.find(d => d.id === 'gdrive-user-gmail-com').accessToken, 'tok-bogus', 'the other account\'s data source is untouched');
    };
    assertSignedOut();

    // Reopening runs syncFromDataSources, which used to copy the tokens straight back.
    app = await openPreferences(home);
    try {
      assert.match(await rowText(app, REAL), /Login Required/);
      assert.ok(!(await exists(app, `[data-cloud-signout="${REAL}"]`)));
    } finally {
      await killApp(app);
    }
    assertSignedOut();
  });
});
