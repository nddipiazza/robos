'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const cloudAccounts = require('./cloud-accounts');
const thunderbirdGoogle = require('./thunderbird-google');

function createTempHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-cloud-accounts-test-'));
  const configDir = path.join(tmp, '.config', 'robos');
  fs.mkdirSync(configDir, { recursive: true });
  return { homeDir: tmp, configDir };
}

test('auto-imports logged-in Google Drive account from data-sources.json and exposes Google Suite endpoints', () => {
  const env = createTempHome();
  const dsFile = path.join(env.configDir, 'data-sources.json');
  fs.writeFileSync(dsFile, JSON.stringify([
    {
      id: 'gdrive-my-google-drive-4ofw',
      name: 'My Google Drive',
      driverType: 'gdrive',
      category: 'storage',
      user: 'nicholas.dipiazza@gmail.com',
      accessToken: 'ya29.test_drive_token',
      refreshToken: '1//0test_refresh_token',
      authStatus: 'authenticated',
      loggedIn: true,
      folders: [{ id: 'root', label: 'My Drive' }],
    },
  ], null, 2));

  const state = cloudAccounts.listAccounts(env);
  assert.equal(state.accounts.length, 1);

  const googleAcc = state.accounts[0];
  assert.equal(googleAcc.provider, 'google');
  assert.equal(googleAcc.email, 'nicholas.dipiazza@gmail.com');
  assert.equal(googleAcc.loggedIn, true);
  assert.equal(googleAcc.isDefault, true);
  assert.equal(googleAcc.hasAccessToken, true);
  assert.equal(googleAcc.hasRefreshToken, true);
  // Renderer-sanitized object must not leak raw tokens
  assert.equal(googleAcc.accessToken, undefined);
  assert.equal(googleAcc.refreshToken, undefined);

  // Verify Google Suite endpoints
  assert.equal(
    googleAcc.endpoints.caldavUrl,
    'https://apidata.googleusercontent.com/caldav/v2/nicholas.dipiazza%40gmail.com/events'
  );
  assert.equal(
    googleAcc.endpoints.carddavUrl,
    'https://www.googleapis.com/carddav/v1/principals/nicholas.dipiazza%40gmail.com/lists/default/'
  );
  assert.equal(googleAcc.suites.drive.enabled, true);
  assert.equal(googleAcc.suites.calendar.enabled, true);
  assert.equal(googleAcc.suites.contacts.enabled, true);
  assert.equal(googleAcc.suites.mail.enabled, false);
  assert.deepEqual(googleAcc.linkedDataSourceIds, ['gdrive-my-google-drive-4ofw']);
});

test('bidirectionally syncs updated tokens from cloud-accounts back to data-sources.json', () => {
  const env = createTempHome();
  const dsFile = path.join(env.configDir, 'data-sources.json');
  fs.writeFileSync(dsFile, JSON.stringify([
    {
      id: 'gdrive-my-google-drive-4ofw',
      name: 'My Google Drive',
      driverType: 'gdrive',
      user: 'nicholas.dipiazza@gmail.com',
      accessToken: 'ya29.old_token',
      refreshToken: '1//0old_refresh',
      loggedIn: true,
    },
  ], null, 2));

  const initial = cloudAccounts.listAccounts(env);
  const accId = initial.accounts[0].id;

  cloudAccounts.saveAccount({
    id: accId,
    provider: 'google',
    email: 'nicholas.dipiazza@gmail.com',
    accessToken: 'ya29.new_refreshed_token',
    refreshToken: '1//0new_refresh',
    loggedIn: true,
  }, env);

  const updatedDsList = JSON.parse(fs.readFileSync(dsFile, 'utf8'));
  assert.equal(updatedDsList[0].accessToken, 'ya29.new_refreshed_token');
  assert.equal(updatedDsList[0].refreshToken, '1//0new_refresh');
});

test('configures Thunderbird profile user.js with CalDAV Calendar, CardDAV Contacts, and optional Gmail IMAP/SMTP', () => {
  const env = createTempHome();
  cloudAccounts.saveAccount({
    provider: 'google',
    email: 'nicholas.dipiazza@gmail.com',
    label: 'Nicholas DiPiazza',
    accessToken: 'ya29.test_token',
    refreshToken: '1//0test_refresh',
    loggedIn: true,
  }, env);

  // 1. Default configuration (Calendar + Contacts enabled, Mail disabled)
  const res1 = thunderbirdGoogle.configureThunderbirdForGoogleAccount(
    'nicholas.dipiazza@gmail.com',
    { enableCalendar: true, enableContacts: true, enableMail: false },
    env
  );

  assert.equal(res1.ok, true);
  assert.equal(res1.enableCalendar, true);
  assert.equal(res1.enableContacts, true);
  assert.equal(res1.enableMail, false);
  assert.ok(res1.writtenFiles.length >= 1);

  const userJs1 = fs.readFileSync(res1.writtenFiles[0], 'utf8');
  assert.match(userJs1, /calendar\.registry\.[^"]+\.type",\s*"caldav"/);
  assert.match(userJs1, /https:\/\/apidata\.googleusercontent\.com\/caldav\/v2\/nicholas\.dipiazza%40gmail\.com\/events/);
  assert.match(userJs1, /ldap_2\.servers\.robos_gcontacts_[a-f0-9]+\.dirType",\s*102/);
  assert.doesNotMatch(userJs1, /imap\.gmail\.com/);

  // 2. Re-configure with Gmail IMAP/SMTP enabled and ensure idempotent replacement (no duplicate blocks)
  const res2 = thunderbirdGoogle.configureThunderbirdForGoogleAccount(
    'nicholas.dipiazza@gmail.com',
    { enableCalendar: true, enableContacts: true, enableMail: true },
    env
  );
  const userJs2 = fs.readFileSync(res2.writtenFiles[0], 'utf8');
  assert.match(userJs2, /imap\.gmail\.com/);
  assert.match(userJs2, /smtp\.gmail\.com/);
  assert.match(userJs2, /authMethod",\s*10/);

  const startMarkers = userJs2.split(thunderbirdGoogle.ROBOS_BLOCK_START).length - 1;
  assert.equal(startMarkers, 1, 'Should replace existing RobOS block for the same account idempotently');
});
