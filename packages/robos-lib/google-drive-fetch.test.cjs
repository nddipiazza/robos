'use strict';

// The shared Drive fetch: rclone's public OAuth client is over its Drive quota most
// minutes, so live calls get 403 rateLimitExceeded. Every Drive caller must retry those
// and report them as rate limiting, never as "no access".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.ROBOS_GDRIVE_RETRY_BASE_MS = '5';

const gfetch = require('./google-drive-fetch');
const { startMockDrive } = require('../robos-test/lib/mock-gdrive-server');

// Drive's real body for an exhausted OAuth client quota (seen 2026-10-29).
const QUOTA_403 = JSON.stringify({
  error: {
    code: 403,
    message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' of service 'drive.googleapis.com' for consumer 'project_number:202264815644'.",
    errors: [{ message: 'Quota exceeded', domain: 'usageLimits', reason: 'rateLimitExceeded' }],
    status: 'PERMISSION_DENIED',
  },
});

async function withDrive(fn) {
  const drive = await startMockDrive({ users: { 'tok-alex': 'alex@example.com' } });
  const prev = process.env.ROBOS_GDRIVE_API_BASE;
  process.env.ROBOS_GDRIVE_API_BASE = drive.url;
  try { await fn(drive); } finally {
    if (prev === undefined) delete process.env.ROBOS_GDRIVE_API_BASE; else process.env.ROBOS_GDRIVE_API_BASE = prev;
    await drive.close();
  }
}

const ABOUT = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)';
const auth = { headers: { Authorization: 'Bearer tok-alex' } };

function countingFetch() {
  const f = (url, init) => { f.calls++; return fetch(url, init); };
  f.calls = 0;
  return f;
}

test('classifies the real quota 403 as rate limiting, and other 403s by reason', () => {
  assert.equal(gfetch.classifyDriveError(403, QUOTA_403).kind, 'rate_limited');
  assert.equal(gfetch.classifyDriveError(403, QUOTA_403).reason, 'rateLimitExceeded');
  const body = reason => ({ error: { code: 403, message: 'x', errors: [{ reason }] } });
  assert.equal(gfetch.classifyDriveError(403, body('userRateLimitExceeded')).kind, 'rate_limited');
  assert.equal(gfetch.classifyDriveError(429, '').kind, 'rate_limited');
  assert.equal(gfetch.classifyDriveError(403, body('insufficientFilePermissions')).kind, 'no_access');
  assert.equal(gfetch.classifyDriveError(403, body('insufficientPermissions')).kind, 'scope');
  assert.equal(gfetch.classifyDriveError(403, body('storageQuotaExceeded')).kind, 'storage_full');
  assert.equal(gfetch.classifyDriveError(404, body('notFound')).kind, 'not_found');
  assert.equal(gfetch.classifyDriveError(503, 'Service Unavailable').kind, 'server');
  assert.match(gfetch.describeDriveError(gfetch.classifyDriveError(403, QUOTA_403)), /rate-limiting/);
});

test('Retry-After accepts delta-seconds and HTTP dates, capped at a minute', () => {
  assert.equal(gfetch.parseRetryAfter('2'), 2000);
  assert.equal(gfetch.parseRetryAfter('0.25'), 250);
  assert.equal(gfetch.parseRetryAfter('3600'), 60000);
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(gfetch.parseRetryAfter('Thu, 29 Oct 2026 12:00:05 GMT', now), 5000);
  assert.equal(gfetch.parseRetryAfter(null), null);
  assert.equal(gfetch.retryDelayMs(0, '1'), 1000);
});

test('retries 403 rateLimitExceeded / userRateLimitExceeded, 429 and 5xx until Drive answers', async () => {
  await withDrive(async drive => {
    const f = countingFetch();
    const retries = [];
    drive.failNext(2);
    drive.failNext(1, { reason: 'userRateLimitExceeded' });
    drive.failNext(1, { status: 429, reason: 'rateLimitExceeded' });
    drive.failNext(1, { status: 503, reason: 'backendError' });
    const res = await gfetch.driveFetch(ABOUT, auth, { fetchImpl: f, onRetry: r => retries.push(r.status) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.emailAddress, 'alex@example.com');
    assert.equal(f.calls, 6);
    assert.deepEqual(retries, [403, 403, 403, 429, 503]);
  });
});

test('honours Retry-After', async () => {
  await withDrive(async drive => {
    drive.failNext(1, { status: 429, reason: 'rateLimitExceeded', retryAfter: 0.3 });
    const started = Date.now();
    const res = await gfetch.driveFetch(ABOUT, auth);
    assert.equal(res.status, 200);
    assert.ok(Date.now() - started >= 280, `waited ${Date.now() - started} ms`);
  });
});

test('real permission errors and 404s come back on the first call, body intact', async () => {
  await withDrive(async drive => {
    const f = countingFetch();
    drive.failNext(1, { status: 403, reason: 'insufficientFilePermissions', message: 'The user does not have sufficient permissions for this file.' });
    const res = await gfetch.driveFetch(ABOUT, auth, { fetchImpl: f });
    assert.equal(res.status, 403);
    assert.equal(f.calls, 1);
    const err = await gfetch.readDriveError(res);
    assert.equal(err.kind, 'no_access');
    assert.equal(err.reason, 'insufficientFilePermissions');

    const missing = await gfetch.driveFetch('/drive/v3/files/nope?fields=id', auth, { fetchImpl: f });
    assert.equal(missing.status, 404);
    assert.equal(f.calls, 2);

    const unauth = await gfetch.driveFetch(ABOUT, { headers: { Authorization: 'Bearer stale' } }, { fetchImpl: f });
    assert.equal(unauth.status, 401, '401 is left to the caller to refresh the token');
    assert.equal(f.calls, 3);
  });
});

test('when retries run out, the error says rate limited, not no access', async () => {
  await withDrive(async drive => {
    drive.failNext(10);
    const res = await gfetch.driveFetch(ABOUT, auth, { maxRetries: 2 });
    assert.equal(res.status, 403);
    assert.equal(res.driveError.kind, 'rate_limited');
    assert.equal(res.driveError.attempts, 3);
    const err = await gfetch.readDriveError(res);
    assert.equal(err.kind, 'rate_limited');
    assert.match(err.text, /Queries per minute/);

    await assert.rejects(gfetch.driveFetchJson(ABOUT, auth, { maxRetries: 2 }), e =>
      e instanceof gfetch.DriveError && e.rateLimited && e.status === 403 && e.reason === 'rateLimitExceeded'
      && /rate-limiting/.test(e.message) && !/does not have access/.test(e.message));
    assert.equal(drive.pendingFailures(), 4);
  });
});

test('verifyCloudAccount reports a healthy account through rate limiting, and names rate limiting when it persists', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-drive-fetch-'));
  fs.mkdirSync(path.join(homeDir, '.config', 'robos'), { recursive: true });
  const ca = require('./cloud-accounts');
  const acc = ca.saveAccount({ provider: 'google', email: 'alex@example.com', accessToken: 'tok-alex', loggedIn: true }, { homeDir });
  const accountId = acc.id || acc.account?.id || ca.listAccounts({ homeDir }).accounts[0].id;

  // Keep the Calendar probe off the network.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => String(url).startsWith('https://') ? Promise.reject(new Error('offline in tests')) : realFetch(url, init);
  try {
    await withDrive(async drive => {
      drive.failNext(3);
      let res = await ca.verifyCloudAccount(accountId, { homeDir });
      assert.equal(res.checks.drive.ok, true, res.checks.drive.detail);
      assert.match(res.checks.drive.detail, /alex@example\.com/);

      drive.failNext(50);
      process.env.ROBOS_GDRIVE_MAX_RETRIES = '2';
      try { res = await ca.verifyCloudAccount(accountId, { homeDir }); } finally { delete process.env.ROBOS_GDRIVE_MAX_RETRIES; }
      assert.equal(res.checks.drive.ok, false);
      assert.equal(res.checks.drive.rateLimited, true);
      assert.match(res.checks.drive.detail, /rate-limiting/);
      assert.doesNotMatch(res.checks.drive.detail, /^HTTP 403 from Google Drive API$/);
    });
  } finally {
    globalThis.fetch = realFetch;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('remote-storage (Data Sources, Audio Player, File Explorer) retries rate limits through the shared helper', async () => {
  const rs = require('../data-sources/lib/remote-storage');
  await withDrive(async drive => {
    drive.failNext(2);
    const data = await rs.gdriveFetchJson(`${ABOUT}&n=1`, { type: 'bearer', token: 'tok-alex' }, { noCache: true });
    assert.equal(data.user.emailAddress, 'alex@example.com');

    drive.failNext(50);
    process.env.ROBOS_GDRIVE_MAX_RETRIES = '1';
    try {
      await assert.rejects(rs.gdriveFetchJson(`${ABOUT}&n=2`, { type: 'bearer', token: 'tok-alex' }, { noCache: true }),
        e => e.rateLimited === true && e.status === 403 && /HTTP 403/.test(e.message) && /rate-limiting/.test(e.message));
    } finally { delete process.env.ROBOS_GDRIVE_MAX_RETRIES; }
  });
});
