const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const {
  cleanMovieFilename,
  detectResolutionFromName,
  detectCodecFromName,
  guessFromRemotePath
} = require('./track-metadata');
const { LibraryIndex, parseM3U, exportM3U } = require('./media-library');
const { parseSrt, parseVtt, parseLrc, syncedToVttDataUrl, getLyrics } = require('./lyrics');
const { generateAiPlaylist, generateDjIntros } = require('./ai-playlist');
const { trackNeedsFix, parseFileHeuristics, generateSvgCoverBuffer, enrichTracksMetadata } = require('./ai-metadata');
const { CastService, parseTxtRecords } = require('./cast-service');

describe('RobOS Movie Player — track-metadata & scene filename cleaning', () => {
  it('cleans scene release tags, year, season/episode, resolution, and codec', () => {
    const cleaned = cleanMovieFilename('Blade.Runner.2049.(2017).2160p.UHD.BluRay.x265.10bit.HDR-GROUP');
    assert.equal(cleaned.title, 'Blade Runner 2049');
    assert.equal(cleaned.year, 2017);
    assert.equal(cleaned.resolution, '4K');
    assert.equal(cleaned.videoCodec, 'HEVC');

    const ep = cleanMovieFilename('The.Expanse.S02E05.Home.1080p.WEB-DL.x264');
    assert.equal(ep.season, 2);
    assert.equal(ep.episode, 5);
    assert.equal(ep.resolution, '1080p');
    assert.equal(ep.videoCodec, 'H.264');
  });

  it('guesses movie metadata from remote cloud paths without downloading', () => {
    const rec = guessFromRemotePath({
      sourceId: 'gdrive-cinema',
      sourceName: 'Google Drive Cinema',
      sourceType: 'google-drive',
      remotePath: '/Denis Villeneuve/Sci-Fi Collection/Arrival (2016) 1080p BluRay x264.mkv',
      size: 4200000000
    });
    assert.equal(rec.title, 'Arrival');
    assert.equal(rec.artist, 'Denis Villeneuve');
    assert.equal(rec.album, 'Sci-Fi Collection');
    assert.equal(rec.year, 2016);
    assert.equal(rec.resolution, '1080p');
    assert.equal(rec.videoCodec, 'H.264');
    assert.equal(rec.source, 'cloud');
  });
});

describe('RobOS Movie Player — Subtitles (.srt, .vtt, .lrc) & VTT Data URL', () => {
  it('parses SubRip (.srt) cues and generates WebVTT data URLs', () => {
    const srt = [
      '1',
      '00:00:02,500 --> 00:00:06,000',
      '<i>Welcome to the RobOS Theater.</i>',
      '',
      '2',
      '00:01:10,000 --> 00:01:14,250',
      'Projector locked at 24 frames per second.'
    ].join('\n');

    const parsed = parseSrt(srt);
    assert.equal(parsed.synced.length, 2);
    assert.equal(parsed.synced[0].t, 2.5);
    assert.equal(parsed.synced[0].end, 6);
    assert.equal(parsed.synced[0].text, 'Welcome to the RobOS Theater.');
    assert.equal(parsed.synced[1].t, 70);

    const vttUrl = syncedToVttDataUrl(parsed.synced);
    assert.ok(vttUrl.startsWith('data:text/vtt;charset=utf-8,'));
  });

  it('parses WebVTT (.vtt) and LRC (.lrc) files', () => {
    const vtt = 'WEBVTT\n\n00:00:05.000 --> 00:00:09.000\nFirst caption line\n';
    const parsedVtt = parseVtt(vtt);
    assert.equal(parsedVtt.synced.length, 1);
    assert.equal(parsedVtt.synced[0].t, 5);
    assert.equal(parsedVtt.synced[0].text, 'First caption line');

    const lrc = '[00:12.50] Spoken dialogue cue';
    const parsedLrc = parseLrc(lrc);
    assert.equal(parsedLrc.synced.length, 1);
    assert.equal(parsedLrc.synced[0].t, 12.5);
  });

  it('returns built-in synced captions for sample Blender open movies', async () => {
    const res = await getLyrics({ id: 'sample-blender-sintel', title: 'Sintel', path: 'https://example.com/Sintel.mp4' });
    assert.equal(res.found, true);
    assert.ok(res.synced.length >= 4);
    assert.ok(res.vttDataUrl.startsWith('data:text/vtt'));
  });
});

describe('RobOS Movie Player — LibraryIndex, M3U, AI Watchlist & Metadata Enricher', () => {
  it('indexes movies, queries by resolution/director, and tracks play stats', () => {
    const idx = new LibraryIndex();
    idx.setTracks([
      { id: 'm1', path: '/movies/sintel.mp4', title: 'Sintel', artist: 'Colin Levy', album: 'Blender Open Movies', genre: 'Fantasy', year: 2010, resolution: '4K', videoCodec: 'HEVC', duration: 888 },
      { id: 'm2', path: '/movies/tos.mp4', title: 'Tears of Steel', artist: 'Ian Hubert', album: 'Blender Open Movies', genre: 'Sci-Fi', year: 2012, resolution: '1080p', videoCodec: 'H.264', duration: 734 }
    ]);

    const summary = idx.getSummary();
    assert.equal(summary.trackCount, 2);
    assert.equal(summary.albumCount, 1);
    assert.equal(summary.artistCount, 2);

    const q4k = idx.queryTracks({ search: '4k hevc' });
    assert.equal(q4k.total, 1);
    assert.equal(q4k.tracks[0].id, 'm1');

    idx.toggleLoved('m2', true);
    idx.recordPlay('m2');
    const loved = idx.queryTracks({ smartFilter: 'loved' });
    assert.equal(loved.total, 1);
    assert.equal(loved.tracks[0].id, 'm2');
  });

  it('round-trips M3U movie watchlists', () => {
    const pl = {
      name: 'Double Feature',
      tracks: [
        { title: 'Sintel', artist: 'Colin Levy', duration: 888, path: '/movies/sintel.mp4' }
      ]
    };
    const m3u = exportM3U(pl);
    const parsed = parseM3U(m3u, '/movies');
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, 'Sintel');
    assert.equal(parsed[0].artist, 'Colin Levy');
  });

  it('generates AI Watchlists and Virtual Cinema Host intros with deterministic fallback', async () => {
    const idx = new LibraryIndex();
    idx.setTracks([
      { id: 'm1', path: '/m1.mp4', title: 'Sintel', artist: 'Colin Levy', album: 'Blender', genre: 'Fantasy', year: 2010, resolution: '1080p', duration: 888 },
      { id: 'm2', path: '/m2.mp4', title: 'Tears of Steel', artist: 'Ian Hubert', album: 'Blender', genre: 'Sci-Fi', year: 2012, resolution: '4K', duration: 734 }
    ]);

    const wl = await generateAiPlaylist({
      prompt: '4K Sci-Fi night',
      libraryIndex: idx,
      count: 2,
      virtualDj: true,
      askFn: async () => ({ ok: false })
    });
    assert.equal(wl.tracks.length, 2);
    assert.equal(wl.tracks[0].id, 'm2');

    const dj = await generateDjIntros({
      tracks: wl.tracks,
      playlistName: wl.name,
      askFn: async () => ({ ok: false })
    });
    assert.ok(dj.intros.m1);
    assert.ok(dj.intros.m2);
  });

  it('enriches messy movie filenames and generates cinema SVG posters', async () => {
    const tmpArtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-movie-art-test-'));
    const tracks = [
      {
        id: 'messy1',
        path: '/Cinema/Christopher Nolan/Sci-Fi/Interstellar.(2014).2160p.UHD.BluRay.x265.mkv',
        title: 'Interstellar.(2014).2160p.UHD.BluRay.x265',
        artist: 'Unknown Director',
        album: 'Standalone Films',
        genre: 'Unknown',
        year: null,
        artId: null
      }
    ];
    const check = trackNeedsFix(tracks[0]);
    assert.equal(check.needsMetadata, true);
    assert.equal(check.needsArt, true);

    const res = await enrichTracksMetadata({
      tracks,
      artDir: tmpArtDir,
      useAi: false,
      generateFallbackArt: true
    });
    assert.equal(res.updatedCount, 1);
    assert.equal(res.artAddedCount, 1);
    assert.equal(res.tracks[0].title, 'Interstellar');
    assert.equal(res.tracks[0].artist, 'Christopher Nolan');
    assert.equal(res.tracks[0].album, 'Sci-Fi');
    assert.equal(res.tracks[0].year, 2014);
    assert.ok(res.tracks[0].artId);
  });

  it('registers manual Smart TV / Chromecast devices in CastService', () => {
    const svc = new CastService();
    const dev = svc.addManualDevice({ name: 'Theater OLED TV', host: '192.168.1.77', port: 8009 });
    assert.equal(dev.name, 'Theater OLED TV');
    assert.equal(svc.getDevices().length, 1);
    const txt = parseTxtRecords([Buffer.from('fn=Living Room TV'), Buffer.from('md=Chromecast Ultra')]);
    assert.equal(txt.fn, 'Living Room TV');
    assert.equal(txt.md, 'Chromecast Ultra');
  });
});
