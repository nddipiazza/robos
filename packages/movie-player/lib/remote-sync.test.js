'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { createRequire } = require('module');
const remoteFile = path.resolve(__dirname, '../../data-sources/lib/remote-storage.js');
const { findDuplicateGoogleSource } = require(remoteFile);

test('duplicate Google sources are rejected by stable folder IDs, not display names', () => {
  const original = { id: 'a', driverType: 'gdrive', folders: [{ id: 'folder-one', label: 'Music' }, { id: 'folder-two' }] };
  assert.equal(findDuplicateGoogleSource([original], { ...original, id: 'b', folders: [...original.folders].reverse() }), original);
  assert.equal(findDuplicateGoogleSource([original], original), undefined);
  assert.equal(findDuplicateGoogleSource([original], { ...original, id: 'b', folders: [{ id: 'different' }] }), undefined);
  assert.equal(findDuplicateGoogleSource([{ id: 'a', driverType: 'gdrive', folderId: 'root', user: 'one@example.test' }],
    { id: 'b', driverType: 'gdrive', folderId: 'root', user: 'two@example.test' }), undefined);
});

test('fresh Google walk bypasses caches, handles large libraries and fails instead of reporting stale success', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-remote-sync-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const sandbox = { require: createRequire(remoteFile), module: { exports: {} }, process: { env: { HOME: home }, platform: process.platform },
    Buffer, URL, console, setTimeout: () => 0, clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(remoteFile, 'utf8') + `
    module.exports.testing = {
      install(fetch) {
        gdriveFetchJson = fetch;
        resolveGoogleDriveAuth = async () => ({type:'bearer', token:'fixture'});
        resolveMissingGDriveFolderLabels = async () => [{id:'music', label:'Music'}];
        resolveGDrivePathToFolderId = async () => 'music';
      }
    };
  `, sandbox, { filename: remoteFile });
  const remote = sandbox.module.exports;
  const ds = { id: 'fixture', name: 'Music', driverType: 'gdrive', accessToken: 'a-real-shaped-fixture-token', folderId: 'music' };
  let calls = 0;
  remote.testing.install(async (_url, _auth, options) => {
    calls++;
    assert.equal(options.noCache, true);
    return { files: Array.from({ length: 6001 }, (_, i) => ({ id: `song-${i}`, name: `Song ${i}.mp3`, parents: ['music'], mimeType: 'audio/mpeg', size: '10' })) };
  });
  const options = { forceRefresh: true, strict: true };
  assert.equal((await remote.walk(ds, '/', () => true, Number.MAX_SAFE_INTEGER, options)).length, 6001);
  await remote.walk(ds, '/', () => true, Number.MAX_SAFE_INTEGER, options);
  assert.equal(calls, 2, 'refresh must bypass persisted walk and directory caches');
  remote.testing.install(async () => { throw new Error('HTTP 429 fixture'); });
  await assert.rejects(remote.walk(ds, '/', () => true, Number.MAX_SAFE_INTEGER, options), /429/);
  assert.equal((await remote.walk(ds, '/', () => true, Number.MAX_SAFE_INTEGER)).length, 6001, 'ordinary browsing may still use its cache');
});
