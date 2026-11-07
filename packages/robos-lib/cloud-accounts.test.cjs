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
      user: 'user@example.com',
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
  assert.equal(googleAcc.email, 'user@example.com');
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
    'https://apidata.googleusercontent.com/caldav/v2/user%40example.com/events'
  );
  assert.equal(
    googleAcc.endpoints.carddavUrl,
    'https://www.googleapis.com/carddav/v1/principals/user%40example.com/lists/default/'
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
      user: 'user@example.com',
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
    email: 'user@example.com',
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
    email: 'user@example.com',
    label: 'Example User',
    accessToken: 'ya29.test_token',
    refreshToken: '1//0test_refresh',
    loggedIn: true,
  }, env);

  // 1. Default configuration (Calendar + Contacts enabled, Mail disabled)
  const res1 = thunderbirdGoogle.configureThunderbirdForGoogleAccount(
    'user@example.com',
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
  assert.match(userJs1, /https:\/\/apidata\.googleusercontent\.com\/caldav\/v2\/user%40example\.com\/events/);
  assert.match(userJs1, /ldap_2\.servers\.robos_gcontacts_[a-f0-9]+\.dirType",\s*102/);
  assert.doesNotMatch(userJs1, /imap\.gmail\.com/);

  // 2. Re-configure with Gmail IMAP/SMTP enabled and ensure idempotent replacement (no duplicate blocks)
  const res2 = thunderbirdGoogle.configureThunderbirdForGoogleAccount(
    'user@example.com',
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

test('Dev Central unified calendar events store seeds, adds, and deletes events tied to the active Google Cloud Account', async () => {
  const env = createTempHome();
  cloudAccounts.saveAccount({
    provider: 'google',
    email: 'user@example.com',
    label: 'Example User',
    accessToken: 'ya29.test_token',
    refreshToken: '1//0test_refresh',
    loggedIn: true,
  }, env);

  const initial = await thunderbirdGoogle.getUnifiedCalendarEvents(null, { ...env, skipNetwork: true });
  assert.equal(initial.ok, true);
  assert.equal(initial.account.email, 'user@example.com');
  assert.ok(initial.events.length >= 5, 'Should seed initial sprint and standup calendar events');

  const added = thunderbirdGoogle.addCalendarEvent({
    summary: 'Sprint 42 Architecture Review with KGraph',
    category: 'sprint',
    location: 'Google Meet',
  }, env);
  assert.equal(added.ok, true);
  assert.equal(added.event.accountEmail, 'user@example.com');

  const afterAdd = await thunderbirdGoogle.getUnifiedCalendarEvents(null, { ...env, skipNetwork: true });
  assert.ok(afterAdd.events.some(e => e.id === added.event.id));

  thunderbirdGoogle.deleteCalendarEvent(added.event.id, env);
  const afterDel = await thunderbirdGoogle.getUnifiedCalendarEvents(null, { ...env, skipNetwork: true });
  assert.ok(!afterDel.events.some(e => e.id === added.event.id));
});

// ── Google sign-in client: why Google's pages say "rclone", and the user's own client ──

/**
 * Runs startGoogleBrowserOAuth against a stubbed Google: returns the consent URL RobOS
 * redirects to and the token-exchange request, plus the sign-in result.
 */
async function runGoogleSignIn(params, env, { email = 'me@example.com', refreshToken = '1//new_refresh' } = {}) {
  const realFetch = globalThis.fetch;
  const tokenRequests = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === 'https://oauth2.googleapis.com/token') {
      tokenRequests.push(Object.fromEntries(new URLSearchParams(String(init.body))));
      return new Response(JSON.stringify({ access_token: 'ya29.test_signin', refresh_token: refreshToken, scope: 'https://www.googleapis.com/auth/drive' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.includes('/drive/v3/about')) {
      return new Response(JSON.stringify({ user: { emailAddress: email } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
  };
  try {
    let gotLoginUrl;
    const loginUrlP = new Promise(r => { gotLoginUrl = r; });
    const resultP = cloudAccounts.startGoogleBrowserOAuth({ ...params, onOpenExternal: gotLoginUrl }, { ...env, oauthPort: 0 });
    const loginUrl = await Promise.race([loginUrlP, resultP.then(() => { throw new Error('sign-in finished before opening the browser'); })]);
    const redirect = await realFetch(loginUrl, { redirect: 'manual' });
    const consentUrl = new URL(redirect.headers.get('location'));
    await realFetch(`${new URL(loginUrl).origin}/?code=test-code`);
    const result = await resultP;
    return { consentUrl, tokenRequests, result };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('the built-in Google client is rclone\'s, so the account says Google shows it as "rclone"', async () => {
  const env = createTempHome();
  const { consentUrl, tokenRequests, result } = await runGoogleSignIn({}, env);

  // Google's consent page names the app registered for this client ID: rclone's.
  assert.equal(consentUrl.origin + consentUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(consentUrl.searchParams.get('client_id'), cloudAccounts.DEFAULT_GDRIVE_CLIENT_ID);
  assert.equal(tokenRequests[0].client_id, cloudAccounts.DEFAULT_GDRIVE_CLIENT_ID);
  assert.equal(cloudAccounts.BUILTIN_GOOGLE_CLIENT_APP_NAME, 'rclone');

  // Everything RobOS itself shows names Google and the email, never rclone.
  assert.equal(result.account.label, 'Google (me@example.com)');
  assert.deepEqual(result.account.oauthClient, { custom: false, clientId: cloudAccounts.DEFAULT_GDRIVE_CLIENT_ID, appName: 'rclone' });
  const ds = JSON.parse(fs.readFileSync(path.join(env.configDir, 'data-sources.json'), 'utf8'));
  assert.equal(ds.length, 1);
  assert.equal(ds[0].id, 'gdrive-google-me-example-com');
  assert.equal(ds[0].name, 'Google (me@example.com)');
  assert.doesNotMatch(JSON.stringify({ label: result.account.label, name: ds[0].name }), /rclone/i);
});

test('signing in with the user\'s own Google client uses it, saves it, and refreshes with it', async () => {
  const env = createTempHome();
  const own = { clientId: '123-own.apps.googleusercontent.com', clientSecret: 'GOCSPX-own-secret' };
  const { consentUrl, tokenRequests, result } = await runGoogleSignIn(own, env);

  assert.equal(consentUrl.searchParams.get('client_id'), own.clientId);
  assert.equal(tokenRequests[0].client_id, own.clientId);
  assert.equal(tokenRequests[0].client_secret, own.clientSecret);
  // An own client can ask for the whole suite at once.
  assert.match(consentUrl.searchParams.get('scope'), /calendar/);
  assert.deepEqual(result.account.oauthClient, { custom: true, clientId: own.clientId, appName: null });
  assert.equal(JSON.stringify(result.account).includes(own.clientSecret), false, 'the renderer never gets the secret');

  // The client is stored with the tokens it issued, on the account and its Drive data source.
  const raw = cloudAccounts.getAccountById(result.account.id, env);
  assert.equal(raw.clientId, own.clientId);
  assert.equal(raw.clientSecret, own.clientSecret);
  const ds = JSON.parse(fs.readFileSync(path.join(env.configDir, 'data-sources.json'), 'utf8'));
  assert.equal(ds[0].clientId, own.clientId);
  assert.equal(ds[0].clientSecret, own.clientSecret);

  // A refresh uses the same client: rclone's would get unauthorized_client.
  const realFetch = globalThis.fetch;
  let refreshBody;
  globalThis.fetch = async (url, init) => {
    refreshBody = Object.fromEntries(new URLSearchParams(String(init.body)));
    return new Response(JSON.stringify({ access_token: 'ya29.test_refreshed', expires_in: 3599 }), { status: 200 });
  };
  try { await cloudAccounts.refreshGoogleAccountToken(result.account.id, env); } finally { globalThis.fetch = realFetch; }
  assert.equal(refreshBody.client_id, own.clientId);
  assert.equal(refreshBody.client_secret, own.clientSecret);
  assert.equal(refreshBody.refresh_token, '1//new_refresh');

  // Signing in again keeps the user's client; useBuiltInClient switches back to rclone's.
  const again = await runGoogleSignIn({ accountId: result.account.id }, env, { refreshToken: '1//again' });
  assert.equal(again.consentUrl.searchParams.get('client_id'), own.clientId);
  const back = await runGoogleSignIn({ accountId: result.account.id, useBuiltInClient: true }, env, { refreshToken: '1//builtin' });
  assert.equal(back.consentUrl.searchParams.get('client_id'), cloudAccounts.DEFAULT_GDRIVE_CLIENT_ID);
  assert.equal(back.result.account.oauthClient.custom, false);
  const after = cloudAccounts.getAccountById(result.account.id, env);
  assert.equal(after.clientId, '');
  assert.equal(after.refreshToken, '1//builtin');
  const dsAfter = JSON.parse(fs.readFileSync(path.join(env.configDir, 'data-sources.json'), 'utf8'));
  assert.equal(dsAfter[0].clientId, '');
});

test('an own client ID without its secret is refused before the browser opens', async () => {
  const env = createTempHome();
  await assert.rejects(
    cloudAccounts.startGoogleBrowserOAuth({ clientId: '123-own.apps.googleusercontent.com', onOpenExternal: () => assert.fail('opened the browser') }, { ...env, oauthPort: 0 }),
    /client secret/,
  );
});

test('Windows and macOS Thunderbird profiles live under %APPDATA%\Thunderbird and ~/Library/Thunderbird', () => {
  const env = createTempHome();
  const win = thunderbirdGoogle.defaultProfileRoots({ ...env, platform: 'win32' });
  assert.deepEqual(win, [path.join(env.homeDir, 'AppData', 'Roaming', 'Thunderbird')]);
  assert.deepEqual(thunderbirdGoogle.defaultProfileRoots({ ...env, platform: 'darwin' }), [path.join(env.homeDir, 'Library', 'Thunderbird')]);

  cloudAccounts.saveAccount({ provider: 'google', email: 'user@example.com', loggedIn: true }, env);
  const res = thunderbirdGoogle.configureThunderbirdForGoogleAccount('user@example.com', { enableMail: true },
    { ...env, platform: 'win32', mockBinaryPath: null });
  assert.equal(res.writtenFiles.length, 1);
  assert.ok(res.writtenFiles[0].startsWith(win[0]));
  assert.ok(fs.existsSync(path.join(win[0], 'profiles.ini')));
});

test('Gmail accounts are activated in prefs.js, merged with accounts Thunderbird already has', () => {
  const env = createTempHome();
  cloudAccounts.saveAccount({ provider: 'google', email: 'user@example.com', loggedIn: true }, env);
  const opts = { ...env, platform: 'linux', mockBinaryPath: null };
  const [profile] = thunderbirdGoogle.ensureThunderbirdProfiles(opts);
  fs.writeFileSync(path.join(profile.fullPath, 'prefs.js'), [
    '// Mozilla User Preferences',
    'user_pref("mail.accountmanager.accounts", "account1");',
    'user_pref("mail.smtpservers", "smtp1");',
    'user_pref("mail.smtp.defaultserver", "smtp1");',
    '',
  ].join('\n'));

  const res = thunderbirdGoogle.configureThunderbirdForGoogleAccount('user@example.com', { enableMail: true }, opts);
  assert.equal(res.mailAccountsActivated, true);
  const prefs = fs.readFileSync(path.join(profile.fullPath, 'prefs.js'), 'utf8');
  const [accountKey] = res.mailActivation[0].accountKeys;
  const [smtpKey] = res.mailActivation[0].smtpKeys;
  assert.match(prefs, new RegExp(`mail\.accountmanager\.accounts", "account1,${accountKey}"`));
  assert.match(prefs, new RegExp(`mail\.smtpservers", "smtp1,${smtpKey}"`));
  assert.match(prefs, /mail\.smtp\.defaultserver", "smtp1"/);

  // Lists stay out of user.js so accounts added in Thunderbird survive restarts.
  const userJs = fs.readFileSync(path.join(profile.fullPath, 'user.js'), 'utf8');
  assert.doesNotMatch(userJs, /mail\.accountmanager\.accounts/);

  // Re-configuring is idempotent.
  const again = thunderbirdGoogle.configureThunderbirdForGoogleAccount('user@example.com', { enableMail: true }, opts);
  assert.equal(again.mailActivation[0].changed, false);
});
