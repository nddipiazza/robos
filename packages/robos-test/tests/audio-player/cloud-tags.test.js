'use strict';
// Cloud songs: tags read from a few byte ranges, folder-name guesses, Cast session reuse.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '../../../audio-player');
const { readTagBytes, mergeTags, createTagQueue } = require(path.join(APP_DIR, 'lib', 'cloud-tags'));
const { guessFromRemotePath } = require(path.join(APP_DIR, 'lib', 'track-metadata'));
const { CastService } = require(path.join(APP_DIR, 'lib', 'cast-service'));

// A fake remote file: records the ranges asked for.
function remote(buffer) {
  const calls = [];
  const fetchRange = async (start, end) => {
    calls.push([start, end]);
    return { buffer: buffer.subarray(start, Math.min(end + 1, buffer.length)), totalSize: buffer.length };
  };
  return { fetchRange, calls };
}

function box(type, size, fill = 0) {
  const b = Buffer.alloc(size, fill);
  b.writeUInt32BE(size, 0);
  b.write(type, 4, 'latin1');
  return b;
}

test('MP3: fetches the whole ID3v2 tag even when it is bigger than the first chunk', async () => {
  const tagSize = 400 * 1024; // e.g. a large embedded cover
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0,
    (tagSize >> 21) & 0x7f, (tagSize >> 14) & 0x7f, (tagSize >> 7) & 0x7f, tagSize & 0x7f]);
  const file = Buffer.concat([header, Buffer.alloc(tagSize + 3 * 1024 * 1024, 1)]);
  const { fetchRange, calls } = remote(file);
  const out = await readTagBytes(fetchRange);
  assert.strictEqual(out.container, 'id3');
  assert.ok(out.buffer.length >= 10 + tagSize, 'whole tag is there');
  assert.ok(out.buffer.length < 1024 * 1024, 'not the whole song');
  assert.strictEqual(out.totalSize, file.length);
  assert.strictEqual(calls.length, 2);
});

test('MP4 with the index after the audio: skips mdat and fetches moov', async () => {
  const file = Buffer.concat([box('ftyp', 28), box('mdat', 2 * 1024 * 1024, 7), box('moov', 5000, 9)]);
  const { fetchRange, calls } = remote(file);
  const out = await readTagBytes(fetchRange);
  assert.strictEqual(out.container, 'mp4');
  assert.strictEqual(out.buffer.length, 28 + 5000, 'ftyp + moov only');
  assert.strictEqual(out.buffer.toString('latin1', 28 + 4, 28 + 8), 'moov');
  const fetched = calls.reduce((n, [s, e]) => n + (e - s + 1), 0);
  assert.ok(fetched < 300 * 1024, `fetched ${fetched} bytes`);
});

test('FLAC: reads metadata blocks past the first chunk', async () => {
  const block = (last, type, len) => {
    const b = Buffer.alloc(4 + len, 2);
    b[0] = (last ? 0x80 : 0) | type;
    b.writeUIntBE(len, 1, 3);
    return b;
  };
  const file = Buffer.concat([Buffer.from('fLaC'), block(false, 0, 34), block(false, 6, 600 * 1024), block(true, 4, 200), Buffer.alloc(2 * 1024 * 1024)]);
  const { fetchRange } = remote(file);
  const out = await readTagBytes(fetchRange);
  assert.strictEqual(out.container, 'flac');
  assert.strictEqual(out.buffer.length, 4 + 38 + 4 + 600 * 1024 + 204);
});

test('folder names give artist / album / track until the tags are read', () => {
  const a = guessFromRemotePath('/Music/Radiohead/OK Computer (1997)/02 - Paranoid Android.mp3');
  assert.deepStrictEqual([a.artist, a.album, a.title, a.trackNumber, a.year], ['Radiohead', 'OK Computer', 'Paranoid Android', 2, 1997]);
  const b = guessFromRemotePath('/Pink Floyd - The Wall/CD2/Hey You.flac');
  assert.deepStrictEqual([b.artist, b.album, b.title, b.discNumber], ['Pink Floyd', 'The Wall', 'Hey You', 2]);
  const c = guessFromRemotePath('/Music/Daft Punk - One More Time.mp3');
  assert.deepStrictEqual([c.artist, c.title], ['Daft Punk', 'One More Time']);
  const d = guessFromRemotePath('/My Drive/Music/01 Song.mp3');
  assert.strictEqual(d.artist, 'Unknown Artist', 'generic folders are not artists');
  assert.notStrictEqual(d.artist, 'Cloud Stream');
});

test('mergeTags keeps the track identity and ignores placeholder values', () => {
  const track = { id: 'x', filePath: '/c/x.mp3', src: 'http://s/x', cloud: { remotePath: '/x.mp3' }, title: 'x', artist: 'Cloud Stream', album: 'Music' };
  const changed = mergeTags(track, { id: 'other', title: 'Real', artist: 'Band', album: 'Unknown Album', trackNumber: 4, genre: 'Rock', duration: 201 }, { fileTitle: 'x' });
  assert.ok(changed);
  assert.deepStrictEqual(
    [track.id, track.src, track.title, track.artist, track.album, track.trackNumber, track.genre, track.duration],
    ['x', 'http://s/x', 'Real', 'Band', 'Music', 4, 'Rock', 201]);
});

test('tag queue: bounded concurrency, one flush per burst, stops on sign-in errors', async () => {
  let running = 0, peak = 0, flushes = 0, authCalls = 0;
  const q = createTagQueue({
    concurrency: 2,
    flushMs: 10,
    read: async (t) => {
      running++; peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 5));
      running--;
      if (t.id === 'bad') throw Object.assign(new Error('logged out'), { authRequired: true });
      return true;
    },
    flush: () => { flushes++; },
    onAuthRequired: () => { authCalls++; },
  });
  q.add([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'a' }]);
  await q.idle();
  assert.strictEqual(peak, 2);
  assert.strictEqual(flushes, 1);
  q.add([{ id: 'bad' }, { id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' }]);
  await q.idle();
  assert.strictEqual(authCalls, 1);
});

test('casting the next song reuses the speaker session instead of relaunching', async () => {
  const cast = new CastService();
  const loads = [];
  const player = { load: (media, opts, cb) => { loads.push(media.contentId); cb(null, { playerState: 'PLAYING' }); } };
  const entry = { client: { close() {} }, player, sessionId: 's1' };
  cast.activeConnections.set('10.0.0.5', entry);
  let stopped = 0;
  cast.stopPlayback = async () => { stopped++; };
  const res = await cast.castMediaUrl('10.0.0.5', 'http://host/media/2.mp3', { title: 'Two' });
  assert.ok(res.ok && res.reused);
  assert.deepStrictEqual(loads, ['http://host/media/2.mp3']);
  assert.strictEqual(stopped, 0, 'the receiver is not stopped between songs');
  assert.strictEqual(cast.activeConnections.get('10.0.0.5'), entry);
});

test('readRemoteRange asks Drive for a byte range and stops reading once it has it', async () => {
  const fs = require('fs');
  const os = require('os');
  const { Readable } = require('stream');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-cloud-'));
  fs.mkdirSync(path.join(home, '.config', 'robos'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'robos', 'data-sources.json'),
    JSON.stringify([{ id: 'gd1', category: 'storage', driverType: 'gdrive', name: 'Drive' }]));
  const savedHome = process.env.HOME;
  process.env.HOME = home;
  const rsPath = require.resolve(path.resolve(APP_DIR, '..', 'data-sources', 'lib', 'remote-storage'));
  const savedRs = require.cache[rsPath];
  const cloudPath = require.resolve(path.join(APP_DIR, 'lib', 'cloud-storage'));
  delete require.cache[cloudPath];
  const file = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < file.length; i++) file[i] = i % 251;
  const ranges = [];
  let honourRange = true;
  require.cache[rsPath] = {
    id: rsPath, filename: rsPath, loaded: true,
    exports: {
      openGDriveMediaStream: async (_ds, { range }) => {
        ranges.push(range);
        const [s, e] = range.replace('bytes=', '').split('-').map(Number);
        const body = honourRange ? file.subarray(s, e + 1) : file;
        return {
          status: honourRange ? 206 : 200,
          contentRange: honourRange ? `bytes ${s}-${e}/${file.length}` : null,
          contentLength: String(body.length),
          stream: Readable.from([body.subarray(0, 1000), body.subarray(1000)]),
        };
      },
    },
  };
  try {
    const cloud = require(cloudPath);
    const a = await cloud.readRemoteRange({ connectionId: 'gd1', remotePath: '/a.mp3' }, 100, 4099);
    assert.deepStrictEqual(ranges, ['bytes=100-4099']);
    assert.strictEqual(a.totalSize, file.length);
    assert.ok(a.buffer.equals(file.subarray(100, 4100)));
    honourRange = false; // a server that ignores Range
    const b = await cloud.readRemoteRange({ connectionId: 'gd1', remotePath: '/a.mp3' }, 5000, 5999);
    assert.ok(b.buffer.equals(file.subarray(5000, 6000)));
  } finally {
    process.env.HOME = savedHome;
    if (savedRs) require.cache[rsPath] = savedRs; else delete require.cache[rsPath];
    delete require.cache[cloudPath];
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('files are served and cast with their real type (DJ clips are WAV)', async () => {
  const { audioMimeType } = require(path.join(APP_DIR, 'lib', 'cast-service'));
  assert.strictEqual(audioMimeType('/tmp/tts-abc.wav'), 'audio/wav');
  assert.strictEqual(audioMimeType('/m/a.FLAC'), 'audio/flac');
  assert.strictEqual(audioMimeType('/m/a.m4a'), 'audio/mp4');
  assert.strictEqual(audioMimeType('/m/a.mp3'), 'audio/mpeg');
  const cast = new CastService();
  const url = cast.registerFile('/tmp/tts-abc.wav');
  assert.match(url, /\.wav$/);
  const id = url.split('/media/')[1].replace(/\.wav$/, '');
  assert.strictEqual(cast.mediaRegistry.get(id).contentType, 'audio/wav');

  const loads = [];
  cast.activeConnections.set('10.0.0.6', { client: { close() {} }, sessionId: 's', player: { load: (media, opts, cb) => { loads.push({ type: media.contentType, opts }); cb(null, {}); } } });
  await cast.castMediaUrl('10.0.0.6', url, { contentType: 'audio/wav', currentTime: 42 });
  assert.deepStrictEqual(loads, [{ type: 'audio/wav', opts: { autoplay: true, currentTime: 42 } }]);
});

test('while casting, the speaker reports its position every second, tagged song or DJ line', async () => {
  const cast = new CastService();
  const updates = [];
  let loads = 0;
  const player = {
    load: (media, opts, cb) => { loads++; cb(null, { playerState: 'PLAYING', media: { duration: 245 } }); },
    getStatus: (cb) => cb(null, { playerState: 'PLAYING', currentTime: 12.5 }),
    seek: (t, cb) => { player.seekedTo = t; cb(null); },
  };
  cast.activeConnections.set('10.0.0.7', { client: { close() {} }, sessionId: 's', player });
  await cast.castMediaUrl('10.0.0.7', 'http://h/media/1.mp3', { title: 'Song' }, st => updates.push(st));
  await new Promise(r => setTimeout(r, 1150));
  const last = updates[updates.length - 1];
  assert.deepStrictEqual([last.playerState, last.currentTime, last.duration, last.role], ['PLAYING', 12.5, 245, 'song']);
  await cast.castMediaUrl('10.0.0.7', 'http://h/media/dj.mp3', { title: 'Virtual DJ', role: 'dj' }, st => updates.push(st));
  await new Promise(r => setTimeout(r, 1100));
  assert.strictEqual(updates[updates.length - 1].role, 'dj');
  assert.deepStrictEqual(await cast.seekPlayback('10.0.0.7', 61), { ok: true });
  assert.strictEqual(player.seekedTo, 61);
  await cast.stopPlayback('10.0.0.7');
  const n = updates.length;
  await new Promise(r => setTimeout(r, 1100));
  assert.strictEqual(updates.length, n, 'no more polling after stop');
});

test('the real audio type is sniffed from the file (an MP3 saved as .wav goes out as MP3)', () => {
  const fs = require('fs');
  const os = require('os');
  const { sniffAudioType } = require(path.join(APP_DIR, 'lib', 'cast-service'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-sniff-'));
  const write = (name, bytes) => { const f = path.join(dir, name); fs.writeFileSync(f, Buffer.concat([Buffer.from(bytes), Buffer.alloc(64)])); return f; };
  try {
    assert.strictEqual(sniffAudioType(write('voice.wav', [0x49, 0x44, 0x33, 4, 0])), 'audio/mpeg');
    assert.strictEqual(sniffAudioType(write('voice2.wav', [0xff, 0xf3, 0x84, 0xc4])), 'audio/mpeg');
    assert.strictEqual(sniffAudioType(write('real.wav', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')])), 'audio/wav');
    assert.strictEqual(sniffAudioType(write('x.mp3', [...Buffer.from('fLaC')])), 'audio/flac');
    const cast = new CastService();
    assert.match(cast.registerFile(path.join(dir, 'voice.wav')), /\.mp3$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
