'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const TYPES = new Set(['intro', 'commercial']);
const FRAME_SIZE = 12 * 8;
const FRAMES_PER_SECOND = 2;

function validRange(type, start, end) {
  return TYPES.has(type) && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end - start >= 0.25;
}

function segment(type, start, end, source) {
  return { id: randomUUID(), type, start, end, source, status: source === 'manual' ? 'confirmed' : 'suggested' };
}

function matchesRange(a, b) {
  if (a.type !== b.type) return false;
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return overlap >= Math.min(a.end - a.start, b.end - b.start) * 0.6;
}

class VideoSegments {
  constructor(configDir) {
    this.file = path.join(configDir, 'movie-segments.json');
    try { this.entries = new Map(Object.entries(JSON.parse(fs.readFileSync(this.file, 'utf8')))); }
    catch { this.entries = new Map(); }
  }

  get(trackId) {
    return this.entries.get(trackId) || { segments: [], scannedAt: null };
  }

  save(trackId, entry) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const entries = new Map(this.entries);
    entries.set(trackId, entry);
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(entries)));
    fs.renameSync(temp, this.file);
    this.entries = entries;
    return entry;
  }

  add(trackId, { type, start, end } = {}) {
    if (!validRange(type, start, end)) throw new Error('Choose an end at least a quarter-second after the start.');
    const entry = this.get(trackId);
    const manual = segment(type, start, end, 'manual');
    const segments = entry.segments.map(item => item.status === 'suggested' && matchesRange(item, manual)
      ? { ...item, status: 'dismissed' } : item);
    return this.save(trackId, { ...entry, segments: [...segments, manual] });
  }

  review(trackId, id, status) {
    if (!['confirmed', 'dismissed'].includes(status)) throw new Error('Unknown segment action.');
    const entry = this.get(trackId);
    if (!entry.segments.some(item => item.id === id)) throw new Error('This video segment no longer exists.');
    const segments = entry.segments.map(item => item.id === id ? { ...item, status } : item);
    return this.save(trackId, { ...entry, segments });
  }

  copyTrimmed(sourceId, trackId, { start, end }) {
    const source = this.get(sourceId);
    const segments = source.segments.flatMap(item => {
      const from = Math.max(item.start, start) - start;
      const to = Math.min(item.end, end) - start;
      return validRange(item.type, from, to) ? [{ ...item, id: randomUUID(), start: from, end: to }] : [];
    });
    if (segments.length || source.scannedAt) this.save(trackId, { segments, scannedAt: source.scannedAt });
  }

  merge(trackId, suggestions) {
    const segments = [...this.get(trackId).segments];
    for (const item of suggestions) {
      if (!validRange(item.type, item.start, item.end)) continue;
      const exists = segments.some(saved => matchesRange(saved, item));
      if (!exists) segments.push(segment(item.type, item.start, item.end, item.source));
    }
    return this.save(trackId, { segments, scannedAt: new Date().toISOString() });
  }
}

function chapterSegments(chapters = []) {
  return chapters.flatMap(chapter => {
    const title = String(chapter.tags?.title || chapter.tags?.TITLE || '').trim().toLowerCase();
    const type = /^(?:intro(?:duction)?|opening(?: (?:titles?|credits|theme|sequence))?|title sequence)(?:[ ._#-]+\d+)?$/.test(title) ? 'intro'
      : /^(?:ads?|ad ?break|commercials?(?: break)?|advertisements?(?: break)?|sponsor(?:ed)? (?:message|break))(?:[ ._#-]+\d+)?$/.test(title) ? 'commercial'
        : null;
    const start = Number(chapter.start_time);
    const end = Number(chapter.end_time);
    return validRange(type, start, end) ? [{ type, start, end, source: 'chapter' }] : [];
  });
}

function commercialSegments(log, duration, hasAudio) {
  const silence = [];
  let begin = null;
  for (const match of log.matchAll(/silence_(start|end):\s*([\d.]+)/g)) {
    const at = Number(match[2]);
    if (match[1] === 'start') begin = at;
    else if (begin !== null) { silence.push([begin, at]); begin = null; }
  }
  if (begin !== null) silence.push([begin, duration]);

  const boundaries = [];
  for (const match of log.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (end - start > 2.5 || start < 3 || end >= duration - 2) continue;
    if (hasAudio && !silence.some(([from, to]) => from <= end + 0.35 && to >= start - 0.35)) continue;
    if (boundaries.length && start - boundaries.at(-1).end < 1) continue;
    boundaries.push({ start, end });
  }

  // Two or more back-to-back spots with common ad runtimes make a plausible break.
  // A single fade or a lone ad-length scene is too weak a signal.
  const found = [];
  let first = 0;
  for (let i = 1; i <= boundaries.length; i++) {
    const span = i < boundaries.length ? boundaries[i].start - boundaries[i - 1].end : NaN;
    const expected = Math.round(span / 15) * 15;
    const isSpot = expected >= 15 && expected <= 60 && Math.abs(span - expected) <= 2.5;
    if (isSpot) continue;
    if (i - first >= 3 && boundaries[i - 1].end - boundaries[first].start <= 360) {
      found.push({ type: 'commercial', start: boundaries[first].start, end: boundaries[i - 1].end, source: 'break cues' });
    }
    first = i;
  }
  return found;
}

function frameDistance(a, ai, b, bi) {
  const aStart = ai * FRAME_SIZE;
  const bStart = bi * FRAME_SIZE;
  let difference = 0;
  for (let i = 0; i < FRAME_SIZE; i++) difference += Math.abs(a[aStart + i] - b[bStart + i]);
  return difference / FRAME_SIZE;
}

// Match runs of low-resolution frames across episodes, allowing a small
// sampling mismatch and different cold-open lengths. Motion keeps static
// title cards and fades from being reported as entire opening sequences.
function repeatedIntro(video, reference) {
  const count = Math.floor(video.length / FRAME_SIZE);
  const otherCount = Math.floor(reference.length / FRAME_SIZE);
  let best = null;
  for (let offset = 1 - count; offset < otherCount; offset++) {
    const limit = Math.min(count, otherCount - offset);
    let start = -1;
    let last = -1;
    let changes = 0;
    for (let i = Math.max(0, -offset); i <= limit; i++) {
      const match = i < limit && frameDistance(video, i, reference, i + offset) < 14;
      if (match) {
        if (start < 0) start = i;
        if (last >= start && frameDistance(video, last, video, i) > 6) changes++;
        last = i;
      }
      if (start >= 0 && (i === limit || i - last > 2)) {
        const frames = last - start + 1;
        if (frames >= 9 * FRAMES_PER_SECOND && frames <= 100 * FRAMES_PER_SECOND
          && frames < Math.min(count, otherCount) * 0.85 && start < 160 * FRAMES_PER_SECOND && changes >= 5 && (!best || frames > best.frames)) {
          best = { type: 'intro', start: start / FRAMES_PER_SECOND, end: (last + 1) / FRAMES_PER_SECOND,
            source: 'repeated opening', frames };
        }
        start = last = -1;
        changes = 0;
      }
    }
  }
  if (!best) return null;
  const { frames, ...result } = best;
  return result;
}

async function openingFrames(file, signal) {
  const { stdout } = await run('ffmpeg', [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-threads', '2',
    '-i', file, '-map', '0:V:0', '-t', '230', '-vf', 'fps=2,scale=12:8:flags=area,format=gray',
    '-an', '-threads:v', '1', '-f', 'rawvideo', 'pipe:1',
  ], { encoding: 'buffer', windowsHide: true, signal, timeout: 90_000, maxBuffer: 512 * 1024 });
  return stdout;
}

async function detectVideoSegments(file, references = [], signal) {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries',
      'chapter=start_time,end_time:chapter_tags=title:format=duration:stream=codec_type', '-of', 'json', file,
    ], { windowsHide: true, signal, timeout: 25_000, maxBuffer: 1024 * 1024 });
    const details = JSON.parse(stdout);
    const found = chapterSegments(details.chapters);
    const duration = Number(details.format?.duration);
    if (!found.some(item => item.type === 'intro') && references.length && duration >= 9) {
      const frames = await openingFrames(file, signal);
      for (const reference of references) {
        let intro;
        try { intro = repeatedIntro(frames, await openingFrames(reference, signal)); }
        catch (err) { if (signal?.aborted) throw err; }
        if (intro) { found.push(intro); break; }
      }
    }
    if (!found.some(item => item.type === 'commercial') && duration >= 35) {
      const hasAudio = details.streams?.some(stream => stream.codec_type === 'audio');
      const filters = hasAudio ? ['-map', '0:a:0', '-af', 'silencedetect=n=-42dB:d=0.16'] : [];
      const { stderr } = await run('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'info', '-nostats', '-protocol_whitelist', 'file,pipe',
        '-threads', '2', '-i', file, '-map', '0:V:0',
        '-vf', 'fps=5,scale=320:-2,blackdetect=d=0.15:pix_th=0.10', ...filters, '-sn', '-dn', '-f', 'null', '-',
      ], { windowsHide: true, signal, timeout: 12 * 60_000, maxBuffer: 4 * 1024 * 1024 });
      found.push(...commercialSegments(stderr, duration, hasAudio));
    }
    return found;
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('Install FFmpeg and ffprobe to detect video segments.');
    if (signal?.aborted) throw err;
    throw new Error('Could not analyze this video. Check that the file is readable and try again.', { cause: err });
  }
}

function registerVideoSegments({ app, ipcMain, getWindow, mediaLibrary }) {
  const { VIDEO_EXTENSIONS } = require('./track-metadata');
  const store = new VideoSegments(mediaLibrary.configDir);
  const opened = new Map();
  const pending = new Map();
  const errors = new Map();
  const shutdown = new AbortController();
  let queue = Promise.resolve();

  function localVideo(track) {
    return track && !track.cloud && !track.mediaService && !track.peerStream
      && path.isAbsolute(track.filePath || '') && VIDEO_EXTENSIONS.has(path.extname(track.filePath).toLowerCase());
  }

  function find(trackId) {
    if (typeof trackId !== 'string' || !trackId || trackId.length > 128) throw new Error('Select a video first.');
    return mediaLibrary.tracks.find(track => track.id === trackId)
      || opened.get(trackId)
      || mediaLibrary.getPlaylists().flatMap(list => list.tracks || []).find(track => track.id === trackId);
  }

  function status(track) {
    const { segments, scannedAt } = store.get(track.id);
    return {
      trackId: track.id, segments: segments.filter(item => item.status !== 'dismissed').sort((a, b) => a.start - b.start),
      scannedAt, scanning: pending.has(track.id), canDetect: !!localVideo(track), error: errors.get(track.id) || null,
    };
  }

  function notify(track) {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('movie:segments-updated', status(track));
  }

  function detect(track) {
    if (!localVideo(track) || shutdown.signal.aborted) return;
    if (pending.has(track.id)) return;
    errors.delete(track.id);
    const work = queue.then(async () => {
      shutdown.signal.throwIfAborted();
      const show = String(track.showName || '').trim().toLowerCase();
      const referenceFiles = show ? mediaLibrary.tracks.filter(candidate => candidate.id !== track.id && localVideo(candidate)
        && candidate.mediaType === 'tv' && String(candidate.showName || '').trim().toLowerCase() === show
        && (candidate.seasonNumber !== track.seasonNumber || candidate.episodeNumber !== track.episodeNumber))
        .sort((a, b) => Math.abs((a.seasonNumber || 0) - (track.seasonNumber || 0))
          - Math.abs((b.seasonNumber || 0) - (track.seasonNumber || 0)))
        .slice(0, 2).map(candidate => candidate.filePath) : [];
      const suggestions = await detectVideoSegments(track.filePath, referenceFiles, shutdown.signal);
      store.merge(track.id, suggestions);
    }).catch(error => {
      if (!shutdown.signal.aborted) errors.set(track.id, error.message);
    }).finally(() => {
      pending.delete(track.id);
      if (!shutdown.signal.aborted) notify(track);
    });
    pending.set(track.id, work);
    queue = work;
    notify(track);
  }

  function register(channel, operation) {
    ipcMain.handle('movie:segments-' + channel, (event, trackId, input) => {
      try {
        if (getWindow()?.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame
          || !event.senderFrame?.url.startsWith('file:')) throw new Error('Open Video segments from Movie Player.');
        const track = find(trackId);
        if (!track) throw new Error('Add this video to the library or open the file again to mark it.');
        operation(track, input);
        return { ok: true, ...status(track) };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
  }

  register('get', () => {});
  register('detect', (track) => {
    if (!localVideo(track)) throw new Error('Automatic detection is available for local video files.');
    detect(track);
  });
  register('add', (track, input) => {
    const duration = Number(track.duration);
    if (duration > 0 && Number(input?.end) > duration + 0.75) throw new Error('The end is past the video duration.');
    store.add(track.id, input);
    notify(track);
  });
  register('review', (track, input) => {
    store.review(track.id, input?.id, input?.status);
    notify(track);
  });
  app.on('before-quit', () => shutdown.abort());

  return {
    detect,
    findTrack: find,
    isLocalVideo: localVideo,
    copyTrimmed: (sourceId, trackId, range) => store.copyTrimmed(sourceId, trackId, range),
    rememberOpened(tracks) {
      for (const track of tracks) if (localVideo(track)) opened.set(track.id, track);
    },
    forgetOpened(trackIds) {
      for (const id of trackIds) opened.delete(id);
    },
  };
}

module.exports = { VideoSegments, chapterSegments, commercialSegments, repeatedIntro, detectVideoSegments, registerVideoSegments };
