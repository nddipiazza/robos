'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point HOME at a throwaway directory before loading the libraries so nothing can touch
// the real ~/.config/robos or ~/.thunderbird.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-gcal-unit-'));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = TMP_HOME;

const ca = require(path.resolve(__dirname, '../../../robos-lib/cloud-accounts'));
const tb = require(path.resolve(__dirname, '../../../robos-lib/thunderbird-google'));

// mockBinaryPath: null skips probing for a real Thunderbird install.
const OPTS = { homeDir: TMP_HOME, mockBinaryPath: null };

function readUserJs() {
  const userJs = path.join(TMP_HOME, '.thunderbird', 'robos001.default-release', 'user.js');
  return fs.readFileSync(userJs, 'utf8');
}

function calUuid(email) {
  return tb.deterministicUuid(`robos-google-caldav:${email.toLowerCase()}`);
}

function refreshIntervalFor(userJs, email) {
  const re = new RegExp(`calendar\\.registry\\.${calUuid(email)}\\.refreshInterval", (\\d+)\\);`);
  const m = userJs.match(re);
  return m ? Number(m[1]) : null;
}

function addGoogleAccount(email) {
  return ca.saveAccount({
    provider: 'google',
    email,
    accessToken: `token-${email}`,
    refreshToken: `refresh-${email}`,
  }, OPTS).account;
}

describe('Google Calendar: Thunderbird sync settings stick', () => {
  let alice;
  let bob;
  let carol;

  before(() => {
    alice = addGoogleAccount('alice@example.com');
    bob = addGoogleAccount('bob@example.com');
    carol = addGoogleAccount('carol@example.com');
  });

  after(() => {
    process.env.HOME = ORIGINAL_HOME;
    fs.rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it('defaults the sync interval to the UI default (15 minutes), not 1', () => {
    const block = tb.generateThunderbirdUserJsBlock({ email: 'dave@example.com' }, { enableCalendar: true });
    assert.strictEqual(block.refreshMinutes, 15);
    assert.match(block.userJsBlock, /\.refreshInterval", 15\);/);
    assert.strictEqual(tb.DEFAULT_CALENDAR_REFRESH_MINUTES, 15);
  });

  it('keeps the chosen interval and an unticked Calendar through the all-accounts pass', () => {
    // What gcal:configure-only does: configure the selected account, then every account.
    tb.configureThunderbirdForGoogleAccount(alice.id, {
      enableCalendar: true,
      enableContacts: true,
      enableMail: false,
      calendarColor: '#a855f7',
      refreshMinutes: 30,
    }, OPTS);
    tb.configureThunderbirdForGoogleAccount(bob.id, {
      enableCalendar: false,
      enableContacts: true,
      enableMail: false,
      refreshMinutes: 45,
    }, OPTS);
    const all = tb.configureAllGoogleAccountsInThunderbird(OPTS);
    assert.strictEqual(all.count, 3);

    const userJs = readUserJs();
    assert.strictEqual(refreshIntervalFor(userJs, 'alice@example.com'), 30, 'alice keeps 30 minutes');
    assert.ok(
      userJs.includes(`calendar.registry.${calUuid('alice@example.com')}.color", "#a855f7"`),
      'alice keeps her calendar color'
    );
    assert.ok(
      !userJs.includes(`calendar.registry.${calUuid('bob@example.com')}.`),
      'bob has Calendar unticked, so no calendar registry entry is written for him'
    );
    assert.ok(userJs.includes('Google Contacts (bob@example.com)'), 'bob still gets his contacts');
    assert.strictEqual(refreshIntervalFor(userJs, 'carol@example.com'), 15, 'never-configured carol gets the default');

    const sortOrder = userJs.match(/calendar\.list\.sortOrder", "([^"]*)"/);
    assert.ok(sortOrder, 'sortOrder written');
    assert.ok(!sortOrder[1].includes(calUuid('bob@example.com')), 'sortOrder does not list bob');

    const storedBob = ca.getAccountById(bob.id, OPTS);
    assert.strictEqual(storedBob.suites.calendar.enabled, false);
    assert.strictEqual(storedBob.calendarRefreshMinutes, 45);
    assert.strictEqual(ca.getAccountById(alice.id, OPTS).calendarRefreshMinutes, 30);
  });

  it('configures a single account with refreshMinutes 30 and Calendar off, and both survive the all-accounts pass', () => {
    tb.configureThunderbirdForGoogleAccount(carol.id, {
      enableCalendar: false,
      enableContacts: true,
      enableMail: false,
      refreshMinutes: 30,
    }, OPTS);
    tb.configureAllGoogleAccountsInThunderbird(OPTS);

    let userJs = readUserJs();
    assert.ok(!userJs.includes(`calendar.registry.${calUuid('carol@example.com')}.`), 'no calendar entry for carol');
    assert.strictEqual(ca.getAccountById(carol.id, OPTS).calendarRefreshMinutes, 30);

    // Ticking Calendar again without sending an interval reuses the stored 30 minutes.
    tb.configureThunderbirdForGoogleAccount(carol.id, { enableCalendar: true }, OPTS);
    tb.configureAllGoogleAccountsInThunderbird(OPTS);
    userJs = readUserJs();
    assert.strictEqual(refreshIntervalFor(userJs, 'carol@example.com'), 30);
  });

  it('drops calendar.list.sortOrder when no account has Calendar ticked', () => {
    for (const acc of [alice, bob, carol]) {
      tb.configureThunderbirdForGoogleAccount(acc.id, { enableCalendar: false }, OPTS);
    }
    tb.configureAllGoogleAccountsInThunderbird(OPTS);
    const userJs = readUserJs();
    assert.ok(!/calendar\.registry\./.test(userJs), 'no calendar registry entries remain');
    assert.ok(!userJs.includes('calendar.list.sortOrder'), 'stale sortOrder removed');
  });

  it('never wrote outside the temp HOME', () => {
    assert.ok(fs.existsSync(path.join(TMP_HOME, '.config', 'robos', 'cloud-accounts.json')));
    assert.ok(fs.existsSync(path.join(TMP_HOME, '.thunderbird', 'profiles.ini')));
  });
});
