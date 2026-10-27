'use strict';
// Reads the tags of cloud (Google Drive / OneDrive) songs without downloading
// them: only the byte ranges that hold the tags are fetched — the ID3v2 tag at the
// start of an MP3, FLAC's metadata blocks, an MP4's `moov` box (wherever it is).
// A background queue fills in artist / album / title for a whole cloud library.

const path = require('path');

const HEAD_BYTES = 256 * 1024;
const AUDIO_AFTER_TAG = 64 * 1024;   // a few MP3 frames after the tag, for bitrate/duration
const MAX_TAG_BYTES = 16 * 1024 * 1024;

const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.wma': 'audio/x-ms-wma',
};

/**
 * Collects the bytes music-metadata needs to read a file's tags.
 * `fetchRange(start, end)` resolves { buffer, totalSize } for bytes start..end (inclusive).
 * Resolves { buffer, totalSize, container } or null if nothing could be read.
 */
async function readTagBytes(fetchRange) {
  const first = await fetchRange(0, HEAD_BYTES - 1);
  if (!first || !first.buffer || !first.buffer.length) return null;
  let head = first.buffer;
  const totalSize = first.totalSize || null;
  const atEnd = () => totalSize != null && head.length >= totalSize;

  // Make sure the first `n` bytes are in `head`.
  const ensure = async (n) => {
    if (head.length >= n || atEnd()) return;
    const more = await fetchRange(head.length, n - 1);
    if (more && more.buffer && more.buffer.length) head = Buffer.concat([head, more.buffer]);
  };

  if (head.toString('latin1', 0, 3) === 'ID3' && head.length >= 10) {
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    const tagEnd = 10 + size + (head[5] & 0x10 ? 10 : 0);
    if (tagEnd <= MAX_TAG_BYTES) await ensure(tagEnd + AUDIO_AFTER_TAG);
    return { buffer: head, totalSize, container: 'id3' };
  }

  if (head.toString('latin1', 0, 4) === 'fLaC') {
    let off = 4;
    for (;;) {
      await ensure(off + 4);
      if (head.length < off + 4) break;
      const last = head[off] & 0x80;
      const end = off + 4 + head.readUIntBE(off + 1, 3);
      if (end > MAX_TAG_BYTES) break;
      off = end;
      if (last) { await ensure(off); break; }
    }
    return { buffer: head.subarray(0, Math.max(off, Math.min(head.length, HEAD_BYTES))), totalSize, container: 'flac' };
  }

  if (head.toString('latin1', 4, 8) === 'ftyp') {
    // Keep `ftyp` and `moov`, skipping the (huge) `mdat` audio data between them.
    const parts = [];
    let off = 0;
    for (let guard = 0; guard < 64; guard++) {
      let hdr = off + 16 <= head.length ? head.subarray(off, off + 16) : null;
      if (!hdr) {
        if (totalSize != null && off + 8 > totalSize) break;
        const got = await fetchRange(off, off + 15);
        if (!got || !got.buffer || got.buffer.length < 8) break;
        hdr = got.buffer;
      }
      let size = hdr.readUInt32BE(0);
      const type = hdr.toString('latin1', 4, 8);
      if (size === 1 && hdr.length >= 16) size = Number(hdr.readBigUInt64BE(8));
      else if (size === 0) size = (totalSize || off + 8) - off;
      if (size < 8) break;
      if (type === 'ftyp' || type === 'moov') {
        if (size > MAX_TAG_BYTES) break;
        let box;
        if (off + size <= head.length) box = head.subarray(off, off + size);
        else {
          const got = await fetchRange(off, off + size - 1);
          if (!got || !got.buffer || got.buffer.length < size) break;
          box = got.buffer;
        }
        parts.push(box);
        if (type === 'moov') return { buffer: Buffer.concat(parts), totalSize: null, container: 'mp4' };
      }
      off += size;
    }
    return null; // no `moov`: no tags to read
  }

  // Ogg / Opus comments and most other formats keep their tags near the start.
  return { buffer: head, totalSize, container: 'other' };
}

/** Parses a cloud song's tags; resolves music-metadata's result or null. */
async function readCloudTags({ fetchRange, parser, name = '' }) {
  const bytes = await readTagBytes(fetchRange);
  if (!bytes) return null;
  const mimeType = MIME_BY_EXT[path.extname(name).toLowerCase()];
  const opts = { duration: false, skipCovers: false };
  try {
    return await parser.parseBuffer(bytes.buffer, { mimeType, size: bytes.totalSize || undefined }, opts);
  } catch {
    // A cut-off buffer can trip the size checks; parse it as a short file instead.
    return await parser.parseBuffer(bytes.buffer, { mimeType }, opts);
  }
}

const PLACEHOLDER_VALUES = new Set(['', 'unknown artist', 'unknown album', 'cloud stream', 'cloud storage']);
const isPlaceholder = (v) => v == null || PLACEHOLDER_VALUES.has(String(v).trim().toLowerCase());

const COPY_FIELDS = ['albumArtist', 'year', 'genre', 'composer', 'trackNumber', 'trackTotal', 'discNumber', 'discTotal',
  'mediaType', 'showName', 'seasonNumber', 'episodeNumber', 'episodeTitle', 'episodeCode',
  'bitrate', 'sampleRate', 'bitsPerSample', 'channels', 'codec', 'lossless', 'artId'];

/**
 * Copies real tag values from `parsed` (a trackFromMetadata() track) onto `track`,
 * keeping its identity (id, path, stream URL, cloud info) and any value the tags
 * don't have. Returns true if anything changed.
 */
function mergeTags(track, parsed, { fileTitle = null } = {}) {
  if (!track || !parsed) return false;
  let changed = false;
  const set = (key, value) => { if (value != null && value !== '' && track[key] !== value) { track[key] = value; changed = true; } };
  if (parsed.title && parsed.title !== fileTitle) set('title', parsed.title);
  if (!isPlaceholder(parsed.artist)) set('artist', parsed.artist);
  if (!isPlaceholder(parsed.album)) set('album', parsed.album);
  if (parsed.duration > 0) set('duration', parsed.duration);
  for (const key of COPY_FIELDS) {
    const v = parsed[key];
    if (v != null && v !== '' && v !== 0 && v !== false) set(key, v);
  }
  return changed;
}

/**
 * Background queue: reads tags for tracks a few at a time and calls `flush` (at
 * most every `flushMs`) once some tracks changed. `read(track)` resolves true when
 * the track changed. An error with `authRequired` stops the queue: every other
 * song on that connection would fail the same way until the user signs in.
 */
function createTagQueue({ read, flush, concurrency = 3, flushMs = 2000, onAuthRequired = null }) {
  const queue = [];
  const queued = new Set();
  let running = 0;
  let dirty = false;
  let timer = null;
  let idleResolvers = [];

  const doFlush = () => {
    timer = null;
    if (dirty) { dirty = false; try { flush(); } catch {} }
  };
  const settle = () => {
    if (running === 0 && queue.length === 0) {
      if (timer) { clearTimeout(timer); doFlush(); }
      const resolvers = idleResolvers;
      idleResolvers = [];
      resolvers.forEach(r => r());
    } else if (dirty && !timer) {
      timer = setTimeout(doFlush, flushMs);
    }
  };
  const pump = () => {
    while (running < concurrency && queue.length) {
      const track = queue.shift();
      running++;
      Promise.resolve()
        .then(() => read(track))
        .then(changed => { if (changed) dirty = true; })
        .catch(err => {
          if (err && err.authRequired) {
            for (const t of queue) queued.delete(t.id);
            queue.length = 0;
            if (onAuthRequired) onAuthRequired(err);
          }
        })
        .finally(() => {
          queued.delete(track.id);
          running--;
          pump();
          settle();
        });
    }
  };

  return {
    add(tracks) {
      for (const t of tracks || []) {
        if (t && t.id && !queued.has(t.id)) { queued.add(t.id); queue.push(t); }
      }
      pump();
    },
    get pending() { return queue.length + running; },
    idle() { return running === 0 && queue.length === 0 ? Promise.resolve() : new Promise(r => idleResolvers.push(r)); },
  };
}

module.exports = { readTagBytes, readCloudTags, mergeTags, createTagQueue, isPlaceholder, HEAD_BYTES };
