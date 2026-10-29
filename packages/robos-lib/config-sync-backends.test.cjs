'use strict';

// Drive client behaviour that differed between the in-memory mock and the real
// www.googleapis.com, found by running Config Sync against live Google Drive.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.ROBOS_GDRIVE_RETRY_BASE_MS = '5';
process.env.ROBOS_GDRIVE_CONSISTENCY_BASE_MS = '40';

const backends = require('./config-sync-backends');
const { startMockDrive } = require('../robos-test/lib/mock-gdrive-server');

const staticTokens = token => ({ get: async () => token });

async function withDrive(opts, fn) {
  const drive = await startMockDrive(opts);
  const prev = process.env.ROBOS_GDRIVE_API_BASE;
  process.env.ROBOS_GDRIVE_API_BASE = drive.url;
  try { await fn(drive); } finally {
    if (prev === undefined) delete process.env.ROBOS_GDRIVE_API_BASE; else process.env.ROBOS_GDRIVE_API_BASE = prev;
    await drive.close();
  }
}

test('parseFolderRef accepts the folder links Drive hands out', () => {
  const id = '1wvaduTXTtlB6RrM-0Eoqo03zXl5UGwlD';
  for (const link of [
    `https://drive.google.com/drive/folders/${id}`,
    `https://drive.google.com/drive/folders/${id}?usp=sharing`,
    `https://drive.google.com/drive/folders/${id}?usp=drive_link`,
    `https://drive.google.com/drive/u/0/folders/${id}`,
    `https://drive.google.com/drive/u/1/folders/${id}?usp=sharing`,
    `https://drive.google.com/drive/mobile/folders/${id}`,
    `https://drive.google.com/open?id=${id}`,
    `https://drive.google.com/drive/folders/${id}?resourcekey=0-abc&usp=sharing`,
    `gdrive:${id}`,
    `  ${id}  `,
  ]) assert.deepEqual(backends.parseFolderRef(link), { kind: 'gdrive', folderId: id }, link);
});

test('rate-limit 403s are retried, and reported as rate limiting rather than "no access"', async () => {
  await withDrive({ users: { 'tok-alex': 'alex@example.com' } }, async drive => {
    const client = backends.createDriveClient({ tokens: staticTokens('tok-alex') });
    drive.failNext(3); // 403 rateLimitExceeded, as Drive sends when the client's quota is used up
    drive.failNext(1, { status: 429, reason: 'rateLimitExceeded' });
    drive.failNext(1, { status: 503, reason: 'backendError' });
    const folder = await client.createFolder('Vault');
    assert.ok(folder.id);

    const strict = backends.createDriveClient({ tokens: staticTokens('tok-alex'), maxRetries: 2 });
    drive.failNext(3, { reason: 'userRateLimitExceeded' });
    await assert.rejects(strict.getFile(folder.id), err => err.status === 403 && err.reason === 'userRateLimitExceeded' && /rate-limiting/.test(err.message) && !/does not have access/.test(err.message));
  });
});

test('real permission errors are not retried and keep the friendly messages', async () => {
  await withDrive({ users: { 'tok-alex': 'alex@example.com', 'tok-bob': 'bob@example.com' } }, async drive => {
    let calls = 0;
    const counting = (url, init) => { calls++; return fetch(url, init); };
    const alex = backends.createDriveClient({ tokens: staticTokens('tok-alex') });
    const bob = backends.createDriveClient({ tokens: staticTokens('tok-bob'), fetchImpl: counting });
    const folder = await alex.createFolder('Private');

    await assert.rejects(bob.getFile(folder.id), err => err.status === 404 && err.reason === 'notFound' && /cannot see it/.test(err.message));
    assert.equal(calls, 1);

    await alex.share(folder.id, 'bob@example.com', 'reader');
    calls = 0;
    await assert.rejects(bob.createFolder('blobs', folder.id), err => err.status === 404);
    const file = await alex.upload('robos-config.json', folder.id, Buffer.from('{}'), 'application/json');
    await assert.rejects(bob.updateContent(file.id, Buffer.from('{"x":1}')), err => err.status === 403 && err.reason === 'insufficientFilePermissions' && /does not have access/.test(err.message));
    assert.equal(calls, 2);
  });
});

test('an expired access token is refreshed once on 401', async () => {
  await withDrive({ users: { 'tok-fresh': 'alex@example.com' } }, async () => {
    let refreshed = 0;
    let token = 'tok-expired';
    const client = backends.createDriveClient({ tokens: { get: async () => token, refresh: async () => { refreshed++; token = 'tok-fresh'; return token; } } });
    const folder = await client.createFolder('Vault');
    assert.ok(folder.id);
    assert.equal(refreshed, 1);
  });
});

test('a recipient joining right after the grant waits for access to reach files inside the share', async () => {
  await withDrive({ users: { 'tok-alex': 'alex@example.com', 'tok-bob': 'bob@example.com' }, inheritDelayMs: 300 }, async () => {
    const alex = backends.createGDriveBackend({ folderId: (await backends.createDriveClient({ tokens: staticTokens('tok-alex') }).createFolder('RobOS Share — Team')).id, tokens: staticTokens('tok-alex') });
    await alex.writeBlob('blob-1', Buffer.from('body'));
    await alex.writeManifest(Buffer.from('{"format":"x"}'));
    await alex.grantAccess(['bob@example.com']);

    const bob = backends.createGDriveBackend({ folderId: alex.describe().folderId, tokens: staticTokens('tok-bob') });
    const meta = await bob.open();
    assert.equal(meta.capabilities.canEdit, false);
    assert.equal((await bob.readManifest()).toString(), '{"format":"x"}');
    assert.equal((await bob.readBlob('blob-1')).toString(), 'body');
  });
});

test('bodies larger than the 5 MB multipart guideline round-trip through upload and media update', async () => {
  await withDrive({ users: { 'tok-alex': 'alex@example.com' } }, async () => {
    const client = backends.createDriveClient({ tokens: staticTokens('tok-alex') });
    const folder = await client.createFolder('Vault');
    const big = crypto.randomBytes(12 * 1048576);
    const file = await client.upload('blob', folder.id, big);
    assert.ok((await client.download(file.id)).equals(big));
    const next = crypto.randomBytes(12 * 1048576);
    await client.updateContent(file.id, next);
    assert.ok((await client.download(file.id)).equals(next));
  });
});
