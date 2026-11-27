'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerVideoDelete } = require('./video-delete');
const { MediaLibrary } = require('./media-library');

test('source deletion validates the confirmation and persists only after moving the video', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'robos-video-delete-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = { id: 'delete', title: 'Delete fixture', filePath: path.join(dir, 'Delete.mp4') };
  const retained = { id: 'keep', filePath: path.join(dir, 'Keep.mp4') };
  const library = new MediaLibrary({ configDir: dir });
  await fs.writeFile(source.filePath, 'first source');
  library.mergeTracks([source, retained]);
  const watchlist = library.createPlaylist({ tracks: [source, retained, source] });

  const isLocalVideo = (track) => !!track && !track.cloud;
  const frame = { url: 'file:///movie-player/index.html' };
  const window = { webContents: { mainFrame: frame } };
  const event = { sender: window.webContents, senderFrame: frame };
  let handler;
  let confirm = async () => ({ response: 0 });
  let move = async () => assert.fail('A canceled or rejected deletion must preserve the source');
  registerVideoDelete({
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    dialog: { showMessageBox: (parent, options) => {
      assert.equal(parent, window);
      assert.equal(options.defaultId, 0);
      assert.equal(options.cancelId, 0);
      assert.ok(options.detail.includes(source.filePath));
      return confirm();
    } },
    shell: { trashItem: (file) => move(file) },
    getWindow: () => window,
    findTrack: (id) => id === source.id ? source : undefined,
    isLocalVideo,
    removeFromLibrary: (track) => library.removeVideoSource(track, isLocalVideo),
  });

  assert.equal((await handler({ ...event, senderFrame: {} }, source.id)).ok, false);
  assert.equal((await handler(event, retained.id)).ok, false);
  assert.deepEqual(await handler(event, source.id), { ok: false, canceled: true });
  assert.equal(await fs.readFile(source.filePath, 'utf8'), 'first source');

  confirm = async () => {
    await fs.writeFile(source.filePath, 'replacement while dialog was open');
    return { response: 1 };
  };
  const changed = await handler(event, source.id);
  assert.equal(changed.ok, false);
  assert.match(changed.error, /source file changed/);

  confirm = async () => ({ response: 1 });
  move = async () => { throw new Error('Trash unavailable'); };
  assert.deepEqual(await handler(event, source.id), { ok: false, error: 'Trash unavailable' });
  assert.equal(await fs.readFile(source.filePath, 'utf8'), 'replacement while dialog was open');
  assert.equal(library.tracks.length, 2);
  assert.equal(watchlist.tracks.length, 3);

  move = async (file) => {
    assert.equal(file, source.filePath);
    await fs.rename(file, path.join(dir, 'trashed.mp4'));
  };
  const result = await handler(event, source.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.trackIds, [source.id]);
  library.mergeTracks([source]); // A batch parsed before deletion may arrive late.
  assert.deepEqual(library.tracks.map(track => track.filePath), [retained.filePath]);
  assert.deepEqual(watchlist.tracks.map(track => track.filePath), [retained.filePath]);
  const reopened = new MediaLibrary({ configDir: dir });
  assert.deepEqual(reopened.tracks.map(track => track.filePath), [retained.filePath]);
  assert.deepEqual(reopened.getPlaylist(watchlist.id).tracks.map(track => track.filePath), [retained.filePath]);
});
