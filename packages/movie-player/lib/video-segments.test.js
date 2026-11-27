'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { VideoSegments, chapterSegments, commercialSegments, repeatedIntro, detectVideoSegments } = require('./video-segments');

test('chapter labels distinguish intros and commercial breaks from ordinary chapters', () => {
  const inputs = ['Opening Credits', 'Ad Break 2', 'The Sponsor', 'End Credits'].map((title, index) => ({
    start_time: String(index * 10), end_time: String(index * 10 + 8), tags: { title },
  }));
  assert.deepEqual(chapterSegments(inputs), [
    { type: 'intro', start: 0, end: 8, source: 'chapter' },
    { type: 'commercial', start: 10, end: 18, source: 'chapter' },
  ]);
});

test('manual and reviewed marks persist and a rejected suggestion stays hidden on a rescan', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-markers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new VideoSegments(dir);
  const suggested = { type: 'commercial', start: 30, end: 95, source: 'break cues' };
  store.merge('video-1', [suggested]);
  const ad = store.get('video-1').segments[0];
  store.review('video-1', ad.id, 'dismissed');
  store.add('video-1', { type: 'intro', start: 4, end: 25 });
  store.merge('video-1', [{ ...suggested, start: 31 }, { type: 'intro', start: 4, end: 24, source: 'chapter' }]);
  const saved = new VideoSegments(dir).get('video-1');
  assert.deepEqual(saved.segments.map(item => [item.type, item.status]), [['commercial', 'dismissed'], ['intro', 'confirmed']]);
  assert.throws(() => store.add('video-1', { type: 'intro', start: 8, end: 7 }), /after the start/);
});

test('repeated opening detection tolerates different cold-open lengths and rejects fades', () => {
  // Use a deterministic random sequence so a static image or neighboring offset cannot match it.
  function distinct(count, seed) {
    let state = seed;
    const samples = Buffer.alloc(count * 96);
    for (let n = 0; n < samples.length; n++) {
      state = Math.imul(1664525, state) + 1013904223 | 0;
      samples[n] = state >>> 24;
    }
    return samples;
  }
  const opening = distinct(42, 29);
  const a = Buffer.concat([distinct(18, 1), opening, distinct(90, 2)]);
  const b = Buffer.concat([distinct(48, 3), opening, distinct(110, 4)]);
  assert.deepEqual(repeatedIntro(a, b), { type: 'intro', start: 9, end: 30, source: 'repeated opening' });
  const fade = Buffer.alloc(40 * 96);
  assert.equal(repeatedIntro(fade, fade), null);
});

test('a single fade or a break with no matching quiet transitions is left unmarked', () => {
  assert.deepEqual(commercialSegments('black_start:5 black_end:6 black_duration:1', 100, false), []);
  const black = [5, 21, 37].map(t => `black_start:${t} black_end:${t + 0.8} black_duration:0.8`).join('\n');
  assert.deepEqual(commercialSegments(black, 49, true), []);
});

const missingTool = ['ffmpeg', 'ffprobe'].find(tool => spawnSync(tool, ['-version'], { windowsHide: true, stdio: 'ignore' }).status !== 0);

test('FFmpeg finds a labeled intro and a break bracketed by quiet dark frames', {
  skip: missingTool && `Install ${missingTool} to run the detector integration check`,
  timeout: 25000,
}, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-segment-detect-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sample.mp4');
  const metadata = path.join(dir, 'chapters.txt');
  fs.writeFileSync(metadata, ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=3400\ntitle=Opening Credits\n');
  const breaks = 'between(t,5,5.8)+between(t,21,21.8)+between(t,37,37.8)';
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=15:d=48',
    '-f', 'lavfi', '-i', 'sine=f=440:d=48', '-i', metadata,
    '-vf', `drawbox=c=black:t=fill:enable='${breaks}'`, '-af', `volume=0:enable='${breaks}'`,
    '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', file,
  ], { windowsHide: true });
  const found = await detectVideoSegments(file);
  assert.deepEqual(found[0], { type: 'intro', start: 0, end: 3.4, source: 'chapter' });
  assert.equal(found[1]?.type, 'commercial');
  assert.ok(Math.abs(found[1].start - 5) < 0.3);
  assert.ok(Math.abs(found[1].end - 37.8) < 0.3);
});
