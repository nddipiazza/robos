'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { MediaLibrary } = require('./media-library');
const {
  DEFAULT_SKILL_TOKEN,
  DEFAULT_FIX_METADATA_PROMPT,
  cleanMediaTitle,
  trackNeedsMetadataFix,
  readSidecarMetadata,
  probeWithFfprobe,
  generateSvgAlbumCover,
  generateWaveformCover,
  buildAgentFixPrompt,
  previewAiMetadataFixes,
  applyAiMetadataFixes,
} = require('./ai-metadata');

test('cleanMediaTitle strips noisy video/ripper tags while preserving feat. and remix info', () => {
  assert.equal(
    cleanMediaTitle('Daft_Punk_-_Harder_Better_Faster_Stronger_[Official_Video]_(1080p).mp3'),
    'Daft Punk - Harder Better Faster Stronger'
  );
  assert.equal(
    cleanMediaTitle('Massive Attack - Teardrop (feat. Elizabeth Fraser) [HD] (Lyrics)'),
    'Massive Attack - Teardrop (feat. Elizabeth Fraser)'
  );
  assert.equal(
    cleanMediaTitle('Aphex Twin - Windowlicker (Acid Edit) - [a1b2c3d4]'),
    'Aphex Twin - Windowlicker (Acid Edit)'
  );
});

test('trackNeedsMetadataFix identifies missing artist/album/artwork or noisy titles', () => {
  assert.equal(trackNeedsMetadataFix({
    id: 'trk_1',
    title: '01 - Intro_Song [Official Video]',
    artist: 'Daft Punk',
    album: 'Discovery',
    year: 2001,
    genre: 'Electronic',
    artId: 'art_123',
  }), true);

  assert.equal(trackNeedsMetadataFix({
    id: 'trk_2',
    title: 'One More Time',
    artist: 'Daft Punk',
    album: 'Discovery',
    year: 2001,
    genre: 'Electronic',
    artId: 'art_123',
  }), false);
});

test('readSidecarMetadata parses sibling .lrc, .cue, and .nfo files', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-sidecar-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const trackFile = path.join(dir, '02_Track.flac');
  fs.writeFileSync(trackFile, 'dummy');
  fs.writeFileSync(path.join(dir, '02_Track.lrc'), '[ti:Digital Love]\n[ar:Daft Punk]\n[al:Discovery]\n[au:Thomas Bangalter]\n');
  fs.writeFileSync(path.join(dir, 'album.cue'), [
    'REM GENRE "French House"',
    'REM DATE 2001',
    'PERFORMER "Daft Punk"',
    'TITLE "Discovery"',
    'FILE "02_Track.flac" WAVE',
    '  TRACK 02 AUDIO',
    '    TITLE "Digital Love"',
    '    PERFORMER "Daft Punk"',
  ].join('\n'));

  const meta = readSidecarMetadata(trackFile);
  assert.equal(meta.title, 'Digital Love');
  assert.equal(meta.artist, 'Daft Punk');
  assert.equal(meta.album, 'Discovery');
  assert.equal(meta.composer, 'Thomas Bangalter');
  assert.equal(meta.year, 2001);
  assert.equal(meta.genre, 'French House');
  assert.equal(meta.trackNumber, 2);
});

test('buildAgentFixPrompt resolves @skill(robos:fix-media-metadata) from skill catalog', () => {
  assert.ok(DEFAULT_FIX_METADATA_PROMPT.includes(DEFAULT_SKILL_TOKEN));
  const prompt = buildAgentFixPrompt({
    userPrompt: DEFAULT_FIX_METADATA_PROMPT,
    inspections: [{
      id: 'trk_abc',
      filePath: '/music/Boards of Canada/Music Has the Right to Children (1998)/01 - Wildlife Analysis.flac',
      ext: '.flac',
      hasExistingArt: false,
      hasEmbeddedArt: false,
      hasFolderArt: false,
      current: { title: '01 - Wildlife Analysis', artist: 'Unknown Artist', album: 'Unknown Album' },
      pathGuess: { title: 'Wildlife Analysis', artist: 'Boards of Canada', album: 'Music Has the Right to Children', year: 1998, trackNumber: 1 },
      sidecar: {},
      probed: null,
    }],
    openDataByTrackId: new Map(),
    baselines: new Map(),
  });
  // Verify the skill instructions from fix-media-metadata/SKILL.md were expanded into the prompt
  assert.ok(prompt.includes('MusicBrainz WS/2 API'));
  assert.ok(prompt.includes('Cover Art Archive'));
  assert.ok(prompt.includes('Wildlife Analysis'));
});

test('previewAiMetadataFixes and applyAiMetadataFixes enrich tags, generate open-source artwork, and write via FFmpeg', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-ai-meta-e2e-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const artistDir = path.join(dir, 'Boards of Canada', 'Music Has the Right to Children (1998)');
  fs.mkdirSync(artistDir, { recursive: true });
  const audioFile = path.join(artistDir, '01 - Wildlife Analysis [Official Audio].mp3');

  // Generate a valid 1-second silent MP3 using open-source ffmpeg
  execFileSync('ffmpeg', [
    '-y', '-v', 'quiet',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', '1',
    '-q:a', '9',
    audioFile,
  ]);

  const mediaLibrary = new MediaLibrary({ configDir: dir });
  const parsedTrack = await mediaLibrary.parseTrack(audioFile);
  mediaLibrary.mergeTracks([parsedTrack]);

  assert.equal(mediaLibrary.tracks.length, 1);
  assert.equal(mediaLibrary.tracks[0].artist, 'Unknown Artist');
  assert.equal(mediaLibrary.tracks[0].artId, null);

  // Run preview with a mocked RobOS agent response & open-data lookup
  const preview = await previewAiMetadataFixes({
    tracks: mediaLibrary.tracks,
    prompt: DEFAULT_FIX_METADATA_PROMPT,
    providerId: 'codex',
    mediaLibrary,
    enableOpenLookup: true,
    lookupMbFn: async () => ({
      source: 'musicbrainz',
      recordingMbid: 'rec-1111',
      releaseMbid: 'rel-2222',
      title: 'Wildlife Analysis',
      artist: 'Boards of Canada',
      albumArtist: 'Boards of Canada',
      album: 'Music Has the Right to Children',
      year: 1998,
      genre: 'IDM',
      trackNumber: 1,
      trackTotal: 17,
      discNumber: 1,
    }),
    lookupLrcFn: async () => null,
    fetchCaaFn: async () => null, // force waveform/generated cover fallback
    askFn: async (sentPrompt) => {
      assert.ok(sentPrompt.includes('Boards of Canada'));
      return {
        ok: true,
        providerId: 'codex',
        text: JSON.stringify({
          summary: 'Cleaned filename noise, matched Boards of Canada (1998) via MusicBrainz, and generated waveform cover art.',
          fixes: [{
            id: mediaLibrary.tracks[0].id,
            title: 'Wildlife Analysis',
            artist: 'Boards of Canada',
            albumArtist: 'Boards of Canada',
            album: 'Music Has the Right to Children',
            year: 1998,
            genre: 'IDM',
            composer: 'Michael Sandison & Marcus Eoin',
            trackNumber: 1,
            trackTotal: 17,
            discNumber: 1,
            discTotal: 1,
            coverAction: 'waveform',
            reason: 'Cleaned [Official Audio], matched 1998 Warp release, generated waveform cover',
          }],
        }),
      };
    },
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.proposals.length, 1);
  const prop = preview.proposals[0];
  assert.equal(prop.changed, true);
  assert.equal(prop.after.title, 'Wildlife Analysis');
  assert.equal(prop.after.artist, 'Boards of Canada');
  assert.equal(prop.after.album, 'Music Has the Right to Children');
  assert.equal(prop.after.year, 1998);
  assert.equal(prop.after.genre, 'IDM');
  assert.ok(prop.after.artId && prop.after.artId.startsWith('art_'));

  // Verify art was stored in mediaLibrary
  const storedArt = mediaLibrary.getArt(prop.after.artId);
  assert.ok(storedArt && storedArt.buffer.length > 100);

  // Apply fixes and write tags + cover art directly into the MP3 via FFmpeg
  const applied = await applyAiMetadataFixes({
    fixes: preview.proposals,
    writeFiles: true,
    mediaLibrary,
  });

  assert.equal(applied.ok, true);
  assert.equal(applied.updatedCount, 1);
  assert.equal(applied.fileWriteResults.length, 1);
  assert.equal(applied.fileWriteResults[0].ok, true);

  // Verify the file on disk actually has the updated ID3 tags via ffprobe!
  const onDisk = await probeWithFfprobe(audioFile);
  assert.ok(onDisk);
  assert.equal(onDisk.title, 'Wildlife Analysis');
  assert.equal(onDisk.artist, 'Boards of Canada');
  assert.equal(onDisk.album, 'Music Has the Right to Children');
  assert.equal(onDisk.year, 1998);
  assert.equal(onDisk.trackNumber, 1);
  assert.equal(onDisk.hasAttachedPic, true);
});
