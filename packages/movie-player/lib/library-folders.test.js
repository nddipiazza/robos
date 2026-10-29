'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LibraryFolders } = require('./library-folders');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-folder-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const connections = ['google', 'google-copy'].map(id => ({ id, name: id, driverType: 'gdrive', browsable: true,
    folders: [{ folderId: 'stable-music-id', label: 'Music', remotePath: '/' }] }));
  const cloud = { listConnections: () => connections, localDirFor: (id, p) => path.join(dir, id, p) };
  const mediaLibrary = { tracks: [], _rebuildIndexes() {}, _saveCache() {},
    _generateTrackId: p => p, buildCloudTrack: async d => ({ id: d.localPath, filePath: d.localPath, cloud: { ...d } }) };
  const make = () => new LibraryFolders({ mediaLibrary, cloud, configDir: dir });
  return { dir, cloud, connections, mediaLibrary, make, folders: make() };
}

test('one persistent Google folder even when Data Sources contains duplicate connections', t => {
  const { folders, make } = fixture(t);
  assert.equal(folders.list().length, 1);
  assert.equal(folders.list()[0].syncEnabled, false);
  const first = folders.add({ kind: 'cloud', connectionId: 'google', path: '/' });
  const again = folders.add({ kind: 'cloud', connectionId: 'google-copy', path: '/' });
  assert.equal(first.id, again.id);
  folders.setEnabled(first.id, false);
  assert.equal(make().list()[0].syncEnabled, false);
  assert.equal(make().list().length, 1);
});

test('legacy duplicate folder records merge without deleting cached tracks', t => {
  const { folders, cloud, mediaLibrary } = fixture(t);
  folders.folders = ['google', 'google-copy'].map((id, i) => ({ id, kind: 'cloud', connectionId: id, path: '/', label: 'Music', syncEnabled: i === 1 }));
  mediaLibrary.tracks = ['google', 'google-copy'].map(id => ({ filePath: path.join(cloud.localDirFor(id, '/'), 'song.mp3') }));
  const result = folders.list();
  assert.equal(result.length, 1);
  assert.equal(result[0].trackCount, 2);
  assert.equal(result[0].syncEnabled, true);
  assert.equal(mediaLibrary.tracks.length, 2);
});

test('concurrent refresh coalesces; updates add/remove tracks and persist sync time', async t => {
  const { folders, cloud, mediaLibrary, make } = fixture(t);
  const f = folders.add({ kind: 'cloud', connectionId: 'google', path: '/' });
  const root = cloud.localDirFor('google', '/');
  mediaLibrary.tracks = [{ filePath: path.join(root, 'deleted.mp3') }, { filePath: 'unrelated-local.mp3' }];
  let calls = 0;
  cloud.indexCloudAudio = async (_id, _paths, _progress, options) => {
    calls++;
    assert.equal(options.forceRefresh, true);
    assert.equal(options.strict, true);
    await new Promise(resolve => setImmediate(resolve));
    const descriptor = { localPath: path.join(root, 'new.mp3'), connectionId: 'google', remotePath: '/new.mp3' };
    return [descriptor, descriptor];
  };
  const [a, b] = await Promise.all([folders.syncCloud(f.id), folders.syncCloud(f.id)]);
  assert.deepEqual(a, { added: 1, removed: 1 });
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(mediaLibrary.tracks.length, 2);
  assert.ok(make().get(f.id).lastSynced);
});

test('offline refresh keeps music and last successful sync, records retryable error', async t => {
  const { folders, cloud, mediaLibrary, make } = fixture(t);
  const f = folders.add({ kind: 'cloud', connectionId: 'google', path: '/' });
  f.lastSynced = '2026-01-01T00:00:00.000Z';
  mediaLibrary.tracks = [{ filePath: path.join(cloud.localDirFor('google', '/'), 'song.mp3') }];
  cloud.indexCloudAudio = async () => { throw new Error('Offline'); };
  await assert.rejects(folders.syncCloud(f.id), /Offline/);
  assert.equal(mediaLibrary.tracks.length, 1);
  assert.equal(make().get(f.id).lastSynced, f.lastSynced);
  assert.equal(make().get(f.id).syncError, 'Offline');
  cloud.indexCloudAudio = async () => [];
  await folders.syncCloud(f.id);
  assert.equal(f.syncError, undefined);
});

test('replaced cloud audio invalidates old bytes and tag state', async t => {
  const { folders, cloud, mediaLibrary } = fixture(t);
  const f = folders.add({ kind: 'cloud', connectionId: 'google', path: '/' });
  const filePath = path.join(cloud.localDirFor('google', '/'), 'song.mp3');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'old');
  mediaLibrary.tracks = [{ filePath, cloud: { size: 3, modified: 'old', tagsRead: true } }];
  cloud.indexCloudAudio = async () => [{ localPath: filePath, size: 4, modified: 'new', cached: true }];
  await folders.syncCloud(f.id);
  assert.equal(fs.existsSync(filePath), false);
  assert.equal(mediaLibrary.tracks[0].cloud.tagsRead, undefined);
  assert.equal(mediaLibrary.tracks[0].cloud.cached, false);
});

test('My Drive root is scoped per account, distinct Google folder IDs stay separate', t => {
  const { folders, connections } = fixture(t);
  connections[0].user = 'one@example.test'; connections[0].folders[0].folderId = 'root';
  connections[1].user = 'two@example.test'; connections[1].folders[0].folderId = 'root';
  assert.equal(folders.list().length, 2);
});

test('P2P peer folder syncs remote Movie Player catalog and rewrites streamUrl to local bridge endpoint', async t => {
  const http = require('http');
  const { folders, mediaLibrary } = fixture(t);

  const srv = http.createServer((req, res) => {
    const host = req.headers.host || '127.0.0.1:19215';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      nodeName: 'box-a-cinema',
      items: [
        {
          id: 'vid-frontier',
          title: 'Frontier Hunters Live',
          mediaType: 'movie',
          streamFormat: 'mp4',
          streamUrl: `http://${host}/media/f_1.mp4`,
          year: 2026,
        },
      ],
    }));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const port = srv.address().port;

  const peerFolder = folders.add({ kind: 'peer', endpoint: `http://127.0.0.1:${port}` });
  const syncRes = await folders.syncPeer(peerFolder.id);
  assert.equal(syncRes.added, 1);
  assert.equal(mediaLibrary.tracks.length, 1);
  assert.equal(mediaLibrary.tracks[0].title, 'Frontier Hunters Live');
  assert.equal(mediaLibrary.tracks[0].src, `http://127.0.0.1:${port}/media/f_1.mp4`);
});

