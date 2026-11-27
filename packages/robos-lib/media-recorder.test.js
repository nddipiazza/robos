'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { createMediaRecorder } = require('./media-recorder');

test('Record to Library rejects invalid and non-web URLs before invoking tools', async () => {
  const recorder = createMediaRecorder({ kind: 'audio' });
  for (const url of ['', '--exec evil', 'file:///test.mp3', 'https://user:password@example.org/audio']) {
    const result = await recorder.start({ url });
    assert.equal(result.ok, false);
    assert.match(result.error, /link/i);
    assert.equal(recorder.pending, undefined);
  }
});

test('incomplete manual labels are rejected before reserving a recording', async () => {
  const audio = createMediaRecorder({ kind: 'audio' });
  const movie = createMediaRecorder({ kind: 'video' });
  assert.match((await audio.startCapture({ label: { artist: 'Artist only' } })).error, /song title/);
  assert.match((await movie.startCapture({ label: { type: 'tv', title: 'The Show', season: 1 } })).error, /both season and episode/);
  assert.equal(audio.pending, undefined);
  assert.equal(movie.pending, undefined);
});

const requiredTools = ['yt-dlp', 'ffmpeg', 'ffprobe'];
const missingTool = requiredTools.find(tool => spawnSync(tool, [tool === 'yt-dlp' ? '--version' : '-version'], {
  windowsHide: true, stdio: 'ignore',
}).status !== 0);

test('Record to Library saves playable, indexed files and cleans up canceled recordings', {
  skip: missingTool && `Install ${missingTool} to run the recording integration check`,
  timeout: 60000,
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'robos-media-record-'));
  const source = path.join(root, 'fixture.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'color=c=purple:s=160x90:d=1:r=24',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-c:a', 'aac', '-shortest',
    '-metadata', 'artist=Fixture Artist', '-movflags', '+faststart', source,
  ], { windowsHide: true });
  const media = await fs.readFile(source);
  let streamStarted;
  const slowRequest = new Promise(resolve => { streamStarted = resolve; });
  const server = http.createServer((req, res) => {
    if (req.url === '/watch') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<title>Library Fixture</title><video src="/Library%20Fixture.mp4"></video>');
      return;
    }
    if (req.url === '/missing') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': media.length });
    if (req.url === '/slow.mp4') {
      res.write(media.subarray(0, 128));
      streamStarted();
    } else res.end(media);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], {
    encoding: 'utf8', windowsHide: true,
  })).streams.map(stream => stream.codec_type);

  function makeRecorder(player, kind) {
    const { MediaLibrary } = require(`../${player}-player/lib/media-library`);
    const configDir = path.join(root, player);
    const library = new MediaLibrary({ configDir });
    const directory = path.join(configDir, 'recordings');
    const recorder = createMediaRecorder({
      kind, directory,
      async index(file) {
        const track = await library.parseTrack(file);
        library.mergeTracks([track]);
        return track;
      },
    });
    return { recorder, directory, reload: () => new MediaLibrary({ configDir }).getLibrary() };
  }

  const audio = makeRecorder('audio', 'audio');
  const song = await audio.recorder.start({ url: url + '/Library%20Fixture.mp4' });
  assert.equal(song.ok, true, song.error);
  assert.match(song.track.title, /Library Fixture/);
  assert.ok(song.track.duration > 0);
  assert.deepEqual(probe(song.track.filePath), ['audio']);
  assert.equal(audio.reload().tracks[0].id, song.track.id);
  const taggedSong = await audio.recorder.start({ url: url + '/Library%20Fixture.mp4', label: {
    title: 'All Night = Live', artist: 'Artist Named by Listener', album: 'The Album',
  } });
  assert.equal(taggedSong.ok, true, taggedSong.error);
  assert.equal(taggedSong.track.title, 'All Night = Live');
  assert.equal(taggedSong.track.artist, 'Artist Named by Listener');
  assert.equal(taggedSong.track.album, 'The Album');

  const movie = makeRecorder('movie', 'video');
  const withAudio = await movie.recorder.start({ url: url + '/watch' });
  assert.equal(withAudio.ok, true, withAudio.error);
  assert.match(withAudio.track.title, /Library Fixture/);
  assert.deepEqual(probe(withAudio.track.filePath), ['video', 'audio']);

  const silent = await movie.recorder.start({ url: url + '/watch', includeAudio: false });
  assert.equal(silent.ok, true, silent.error);
  assert.deepEqual(probe(silent.track.filePath), ['video']);
  assert.notEqual(withAudio.track.filePath, silent.track.filePath);
  assert.equal(movie.reload().tracks.length, 2);

  const failed = await movie.recorder.start({ url: url + '/missing' });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /404/);
  const pending = movie.recorder.start({ url: url + '/slow.mp4' });
  await slowRequest;
  assert.match((await movie.recorder.start({ url: url + '/watch' })).error, /already in progress/);
  assert.equal(movie.recorder.cancel(), true);
  assert.deepEqual(await pending, { canceled: true });
  assert.equal((await fs.readdir(movie.directory)).length, 2);
  assert.ok(!(await fs.readdir(path.dirname(movie.directory))).some(name => name.startsWith('.recording-')));
});

const liveTools = ['ffmpeg', 'ffprobe'];
const missingLiveTool = liveTools.find(tool => spawnSync(tool, ['-version'], { windowsHide: true, stdio: 'ignore' }).status !== 0);

test('live recordings embed manual labels, preserve them on reload, and keep the selected streams', {
  skip: missingLiveTool && `Install ${missingLiveTool} to run the live recording integration check`,
  timeout: 30000,
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'robos-live-record-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixture = path.join(root, 'capture.webm');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=160x90:d=1',
    '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'libvpx', '-c:a', 'libopus', '-shortest', fixture],
  { windowsHide: true });
  const data = await fs.readFile(fixture);
  const expected = [
    { kind: 'audio', ext: '.mp3', streams: ['audio'], label: { title: 'Live Recording', artist: 'The Artist', album: 'Live' },
      tags: { title: 'Live Recording', artist: 'The Artist', album: 'Live' } },
    { kind: 'video', ext: '.mp4', streams: ['video', 'audio'], label: { title: 'Fictional Show', type: 'tv', season: 2, episode: 3, episodeTitle: 'Opening Night' },
      tags: { mediaType: 'tv', showName: 'Fictional Show', seasonNumber: 2, episodeNumber: 3, title: 'Fictional Show · S02E03 · Opening Night' } },
    { kind: 'video', includeAudio: false, ext: '.mp4', streams: ['video'], label: { title: 'Project S01E02', type: 'movie', year: 2020 },
      tags: { mediaType: 'movie', title: 'Project S01E02', year: 2020 } },
    { kind: 'video', includeAudio: false, ext: '.mp4', streams: ['video'], label: { title: 'Fictional Show', type: 'tv' },
      tags: { mediaType: 'tv', showName: 'Fictional Show', seasonNumber: 0, episodeNumber: 0, episodeCode: 'Unnumbered' } },
  ];
  const directory = path.join(root, 'recordings');
  let indexed = 0;
  for (const { kind, includeAudio, ext, streams, label, tags } of expected) {
    const player = kind === 'video' ? 'movie' : 'audio';
    const { MediaLibrary } = require(`../${player}-player/lib/media-library`);
    const configDir = path.join(root, `config-${indexed}`);
    const library = new MediaLibrary({ configDir });
    const recorder = createMediaRecorder({
      kind, directory,
      async index(filePath, metadata) {
        assert.equal(metadata.source, 'desktop');
        assert.equal(metadata.label.title, label.title);
        indexed++;
        const track = await library.parseTrack(filePath);
        library.mergeTracks([track]);
        return track;
      },
    });
    assert.deepEqual(await recorder.startCapture({ includeAudio, label }), { ok: true });
    await recorder.appendCapture(data.subarray(0, 1200));
    await recorder.appendCapture(data.subarray(1200));
    const result = await recorder.finishCapture();
    assert.equal(result.ok, true, result.error);
    const saved = result.track.filePath;
    assert.equal(path.extname(saved), ext);
    assert.ok(path.basename(saved).startsWith(label.title));
    const reloaded = new MediaLibrary({ configDir }).getLibrary().tracks[0];
    for (const [key, value] of Object.entries(tags)) {
      assert.equal(result.track[key], value, key);
      assert.equal(reloaded[key], value, key);
    }
    if (kind === 'video' && label.type === 'movie') {
      assert.equal(require('../movie-player/lib/library-index').inferTvShowEpisode(reloaded), null);
    }
    const media = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', saved], {
      encoding: 'utf8', windowsHide: true,
    }));
    assert.deepEqual(media.streams.map(stream => stream.codec_type), streams);

    assert.deepEqual(await recorder.startCapture(), { ok: true });
    const pending = recorder.pending;
    await recorder.appendCapture(data.subarray(0, 1200));
    assert.equal(recorder.cancel(), true);
    assert.deepEqual(await pending, { canceled: true });
  }
  assert.equal(indexed, expected.length);
  assert.equal((await fs.readdir(directory)).length, expected.length);
  assert.ok(!(await fs.readdir(root)).some(name => name.startsWith('.recording-')));
});
