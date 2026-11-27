'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { trimToLibrary } = require('./video-trim');
const { VideoSegments } = require('./video-segments');

test('video segment marks are shifted and clipped on the edited copy', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'robos-trim-marks-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new VideoSegments(root);
  store.add('original', { type: 'intro', start: 0, end: 2 });
  store.add('original', { type: 'commercial', start: 3, end: 5 });
  store.add('original', { type: 'commercial', start: 6, end: 7 });
  store.copyTrimmed('original', 'edited', { start: 1, end: 4 });
  const edited = store.get('edited').segments;
  assert.deepEqual(edited.map(item => [item.type, item.start, item.end]), [['intro', 0, 1], ['commercial', 2, 3]]);
  assert.equal(store.get('original').segments.length, 3);
  assert.notEqual(edited[0].id, store.get('original').segments[0].id);
});

const missingTool = ['ffmpeg', 'ffprobe'].find(tool =>
  spawnSync(tool, ['-version'], { windowsHide: true, stdio: 'ignore' }).status !== 0);

test('both video trims export accurate playable copies, rebase chapters and retain audio and text subtitles', {
  skip: missingTool && `Install ${missingTool} to run the video trim integration check`,
  timeout: 30000,
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'robos-video-trim-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'Source.mp4');
  const metadata = path.join(root, 'chapters.txt');
  const captions = path.join(root, 'captions.srt');
  await fs.writeFile(metadata, ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=3000\ntitle=Intro\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=3000\nEND=6000\ntitle=Rest\n');
  await fs.writeFile(captions, '1\n00:00:00,500 --> 00:00:01,000\nOpening\n\n2\n00:00:03,500 --> 00:00:04,000\nLater\n');
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=30:d=3',
    '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-i', captions, '-i', metadata,
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-map', '3:s', '-map_chapters', '4',
    '-metadata', 'title=Source', '-c:v', 'libx264', '-c:a', 'aac', '-c:s', 'mov_text', filePath,
  ], { windowsHide: true });
  const original = await fs.readFile(filePath);
  const directory = path.join(root, 'edits');
  const track = { filePath, title: 'Source', mediaType: 'movie', year: 2004 };
  const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', file], {
    encoding: 'utf8', windowsHide: true,
  }));
  const firstFrame = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-vf', 'scale=1:1', '-frames:v', '1',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true });
  let indexed = 0;
  for (const [edge, point, length, firstChannel, chapters] of [
    ['start', 3.25, 2.75, 2, [[0, 2.75, 'Rest']]],
    ['end', 3.25, 3.25, 0, [[0, 3, 'Intro'], [3, 3.25, 'Rest']]],
  ]) {
    const result = await trimToLibrary({
      track, point, edge, directory, signal: new AbortController().signal,
      async index(file, source, range) {
        assert.equal(source, track);
        assert.deepEqual(range, edge === 'start' ? { start: point, end: 6 } : { start: 0, end: point });
        indexed++;
        return { filePath: file };
      },
    });
    assert.equal(result.ok, true, result.error);
    const edited = result.track.filePath;
    const info = probe(edited);
    assert.ok(Math.abs(Number(info.format.duration) - length) < 0.08, info.format.duration);
    assert.equal(info.format.tags.title, 'Source (Trimmed)');
    assert.equal(info.format.tags.date, '2004');
    assert.ok(info.streams.some(s => s.codec_type === 'audio'));
    assert.ok(info.streams.some(s => s.codec_name === 'mov_text'));
    assert.deepEqual(info.chapters.map(c => [Number(c.start_time), Number(c.end_time), c.tags.title]), chapters);
    const pixel = firstFrame(edited);
    assert.ok(pixel[firstChannel] > 180, JSON.stringify([...pixel]));
  }
  const canceled = new AbortController();
  const result = await trimToLibrary({
    track, point: 3, edge: 'end', directory, signal: canceled.signal,
    index() { assert.fail('Canceled trim must stay out of the library'); },
    onProgress() { canceled.abort(); },
  });
  assert.deepEqual(result, { canceled: true });
  const invalid = await trimToLibrary({
    track, point: 0, edge: 'start', directory, signal: new AbortController().signal,
    index() { assert.fail('Invalid trim must stay out of the library'); },
  });
  assert.match(invalid.error, /quarter-second/);
  assert.equal(indexed, 2);
  assert.equal((await fs.readdir(directory)).length, 2);
  assert.deepEqual(await fs.readFile(filePath), original);
});
