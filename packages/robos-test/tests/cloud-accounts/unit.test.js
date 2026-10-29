'use strict';
const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point HOME at a throwaway directory before loading the library so nothing can touch
// the real ~/.config/robos.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-cloud-accounts-unit-'));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = TMP_HOME;

const ca = require(path.resolve(__dirname, '../../../robos-lib/cloud-accounts'));

const OPTS = { homeDir: TMP_HOME };
const CONFIG_DIR = path.join(TMP_HOME, '.config', 'robos');
const RENDERER_APP = path.resolve(__dirname, '../../../cloud-accounts/renderer/app.js');

function find(state, id) {
  return state.accounts.find((a) => a.id === id);
}

describe('Cloud Accounts: logged-in state comes from stored credentials', () => {
  after(() => {
    process.env.HOME = ORIGINAL_HOME;
    fs.rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it('an account added without credentials is not logged in', () => {
    const { account } = ca.saveAccount({ provider: 'nextcloud', email: 'me@cloud.example', label: 'Home Nextcloud' }, OPTS);
    assert.strictEqual(account.loggedIn, false);
    assert.strictEqual(account.status, 'Login Required');
    assert.strictEqual(account.authStatus, 'logged_out');
  });

  it('a stored loggedIn: true with no credential is not trusted (old Add / Link records)', () => {
    const { account } = ca.saveAccount({ provider: 'dropbox', email: 'old@dropbox.example', loggedIn: true, authStatus: 'authenticated' }, OPTS);
    assert.strictEqual(account.loggedIn, false);
    assert.strictEqual(account.status, 'Login Required');
    assert.strictEqual(account.authStatus, 'logged_out');
  });

  it('a hand-added Google account (with a Data Sources entry) is not logged in', () => {
    const { account } = ca.saveAccount({ provider: 'google', email: 'typed@gmail.example', createDataSource: true }, OPTS);
    assert.strictEqual(account.loggedIn, false);
    const ds = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'data-sources.json'), 'utf8'));
    const entry = ds.find((d) => d.user === 'typed@gmail.example');
    assert.ok(entry, 'Data Sources entry created');
    assert.strictEqual(entry.loggedIn, false);
    assert.strictEqual(find(ca.listAccounts(OPTS), account.id).loggedIn, false, 'stays logged out after re-sync');
  });

  it('an account with tokens is logged in', () => {
    const { account } = ca.saveAccount({
      provider: 'google',
      email: 'signed-in@gmail.example',
      accessToken: 'ya29.test',
      refreshToken: '1//refresh',
    }, OPTS);
    assert.strictEqual(account.loggedIn, true);
    assert.strictEqual(account.status, 'Connected');
    assert.strictEqual(account.hasRefreshToken, true);
  });

  it('an explicit loggedIn: false still wins over stored tokens', () => {
    const { account } = ca.saveAccount({
      provider: 'google',
      email: 'signed-out@gmail.example',
      accessToken: 'ya29.stale',
      loggedIn: false,
    }, OPTS);
    assert.strictEqual(account.loggedIn, false);
  });

  it('accounts imported from Data Sources keep their logged-in state when they carry credentials', () => {
    const dsFile = path.join(CONFIG_DIR, 'data-sources.json');
    const existing = JSON.parse(fs.readFileSync(dsFile, 'utf8'));
    existing.push(
      { id: 'ds-drive', driverType: 'gdrive', user: 'drive@gmail.example', accessToken: 'ya29.ds', refreshToken: '1//ds', loggedIn: true },
      { id: 'ds-mount', driverType: 'gdrive', user: 'mount@gmail.example', localMountPath: '/mnt/gdrive', loggedIn: true },
      { id: 'ds-webdav', driverType: 'webdav', user: 'dav@nextcloud.example', password: 'app-password', loggedIn: true },
      { id: 'ds-empty', driverType: 'onedrive', user: 'empty@outlook.example', loggedIn: true }
    );
    fs.writeFileSync(dsFile, JSON.stringify(existing, null, 2));

    const state = ca.listAccounts(OPTS);
    const byEmail = (email) => state.accounts.find((a) => a.email === email);
    assert.strictEqual(byEmail('drive@gmail.example').loggedIn, true, 'OAuth tokens');
    assert.strictEqual(byEmail('mount@gmail.example').loggedIn, true, 'local mount');
    assert.strictEqual(byEmail('dav@nextcloud.example').loggedIn, true, 'password kept in data-sources.json');
    assert.strictEqual(byEmail('empty@outlook.example').loggedIn, false, 'no credential anywhere');

    const raw = fs.readFileSync(path.join(CONFIG_DIR, 'cloud-accounts.json'), 'utf8');
    assert.ok(!raw.includes('app-password'), 'the Data Sources password is not copied into cloud-accounts.json');
  });

  it('Verify reports the real state for a non-Google account without credentials', async () => {
    const res = await ca.verifyCloudAccount('nextcloud-me-cloud-example', OPTS);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.checks.auth.ok, false);
    assert.match(res.error, /Login Required/);
    assert.doesNotMatch(res.checks.auth.detail, /Authenticated|Connected/);
  });

  it('Verify for a non-Google account with credentials says it did not check them live', async () => {
    const acc = ca.listAccounts(OPTS).accounts.find((a) => a.email === 'dav@nextcloud.example');
    const res = await ca.verifyCloudAccount(acc.id, OPTS);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.checks.auth.live, false);
    assert.match(res.checks.auth.detail, /not checked/);
  });

  it('Verify for a Google account without tokens fails without a network call', async () => {
    const res = await ca.verifyCloudAccount('google-typed-gmail-example', OPTS);
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /Login Required/);
    assert.strictEqual(res.account.loggedIn, false);
  });

  it('the Add / Link form no longer claims loggedIn', () => {
    const src = fs.readFileSync(RENDERER_APP, 'utf8');
    const saveCall = src.slice(src.indexOf("getElementById('btn-save-account')"));
    assert.ok(saveCall.includes('window.robos.saveAccount('), 'save handler found');
    assert.doesNotMatch(saveCall, /loggedIn:\s*true/);
  });

  it('Sign out clears tokens on the account and its data source, and stays signed out on the next read', () => {
    const id = 'google-drive-gmail-example';
    assert.ok(find(ca.listAccounts(OPTS), id), 'the account imported from ds-drive exists');
    const res = ca.signOutAccount(id, OPTS);
    assert.deepStrictEqual(res.signedOutDataSourceIds, ['ds-drive']);
    assert.strictEqual(find(res, id).loggedIn, false);

    const again = find(ca.listAccounts(OPTS), id);
    assert.strictEqual(again.loggedIn, false, 'syncFromDataSources must not sign it back in');
    assert.strictEqual(again.hasRefreshToken, false);
    const ds = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'data-sources.json'), 'utf8')).find((d) => d.id === 'ds-drive');
    assert.strictEqual(ds.accessToken, '');
    assert.strictEqual(ds.refreshToken, '');
    assert.strictEqual(ds.loggedIn, false);
    assert.ok(find(ca.listAccounts(OPTS), 'google-mount-gmail-example').loggedIn, 'other accounts are untouched');
  });

  it('saving new tokens after a sign-out signs the account back in', () => {
    const { account } = ca.saveAccount({ id: 'google-drive-gmail-example', provider: 'google', accessToken: 'ya29.fresh', refreshToken: '1//fresh' }, OPTS);
    assert.strictEqual(account.loggedIn, true);
    assert.strictEqual(account.status, 'Connected');
  });
});
