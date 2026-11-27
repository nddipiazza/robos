'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-lyrics-'));
const previousHome = process.env.HOME;
process.env.HOME = home;
const { getLyrics, normalizeQuery } = require('../lib/lyrics');
if (previousHome === undefined) delete process.env.HOME;
else process.env.HOME = previousHome;
after(() => fs.rmSync(home, { recursive: true, force: true }));

const original = {
  artistName: 'Example Artist', albumName: 'Example Album', trackName: 'Example Song',
  duration: 238, syncedLyrics: '[00:01.00] First line', plainLyrics: 'First line',
};
const track = {
  artist: original.artistName, album: original.albumName, title: 'Example Artist Example Song With Lyrics',
};

test('a decorated title uses timestamps only when the recording length matches', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const query = new URL(url);
    const title = query.searchParams.get('track_name');
    if (query.pathname.endsWith('/get')) return new Response('', { status: 404 });
    const results = title === 'Example Song' ? [original] : [];
    return Response.json(results);
  });
  assert.deepEqual(normalizeQuery(track).titles, [track.title, 'Example Song']);
  for (const duration of [160, 0]) {
    const result = await getLyrics({ ...track, duration });
    assert.equal(result.plain, 'First line');
    assert.deepEqual(result.synced, []);
  }
  const timed = await getLyrics({ ...track, duration: 238 });
  assert.deepEqual(timed.synced, [{ t: 1, text: 'First line' }]);
});

test('a RobOS Media Server sidecar supplies timings for its recording directly', async t => {
  const lyricsUrl = 'http://127.0.0.1/api/subtitles/fixture.vtt';
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, lyricsUrl);
    return new Response('[00:02.00] Sidecar line');
  });
  const result = await getLyrics({ ...track, duration: 160, mediaService: { lyricsUrl } });
  assert.deepEqual(result, { found: true, source: 'media-server', synced: [{ t: 2, text: 'Sidecar line' }] });
  assert.equal(fetch.mock.callCount(), 1);
});
