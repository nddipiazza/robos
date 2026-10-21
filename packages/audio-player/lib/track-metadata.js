'use strict';

// Shared track-building helpers used by MediaLibrary (main thread) and the
// background scan worker, so both produce identical track records.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma']);

// Image files commonly dropped next to album tracks, in preference order.
const FOLDER_COVER_NAMES = ['cover', 'folder', 'front', 'album', 'albumart'];
const FOLDER_COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FOLDER_COVER_BYTES = 8 * 1024 * 1024;

function generateTrackId(filePath) {
  return `trk_${crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 16)}`;
}

// Art is keyed by image content so every track of an album shares one cached file.
function generateArtId(buffer) {
  return `art_${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)}`;
}

function toSafeFileUrl(filePath) {
  try {
    return pathToFileURL(filePath).href;
  } catch {
    return encodeURI(`file://${filePath}`);
  }
}

function imageFormatForExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Look for cover.jpg / folder.png / ... beside a track. Results are memoised
 * per directory in `cache` (a Map) so a 20-track album costs one readdir.
 */
function findFolderCover(dir, cache = null) {
  if (cache && cache.has(dir)) return cache.get(dir);
  let found = null;
  try {
    const byLower = new Map(fs.readdirSync(dir).map(name => [name.toLowerCase(), name]));
    outer:
    for (const base of FOLDER_COVER_NAMES) {
      for (const ext of FOLDER_COVER_EXTS) {
        const real = byLower.get(base + ext);
        if (!real) continue;
        const full = path.join(dir, real);
        const stat = fs.statSync(full);
        if (stat.isFile() && stat.size > 0 && stat.size <= MAX_FOLDER_COVER_BYTES) {
          found = { data: fs.readFileSync(full), format: imageFormatForExt(ext) };
          break outer;
        }
      }
    }
  } catch {}
  if (cache) cache.set(dir, found);
  return found;
}

function firstOf(value) {
  if (Array.isArray(value)) return value.find(v => v != null && String(v).trim()) || null;
  return value || null;
}

/**
 * Build a library track from music-metadata output.
 * Returns { track, art } where art is { artId, buffer, format } or null.
 */
function trackFromMetadata(filePath, metadata, parser, coverCache = null) {
  const common = metadata.common || {};
  const format = metadata.format || {};

  let cover = parser && typeof parser.selectCover === 'function' ? parser.selectCover(common.picture) : null;
  if (!cover || !cover.data) cover = findFolderCover(path.dirname(filePath), coverCache);

  let art = null;
  if (cover && cover.data) {
    const buffer = Buffer.from(cover.data);
    art = { artId: generateArtId(buffer), buffer, format: cover.format || 'image/jpeg' };
  }

  const track = {
    id: generateTrackId(filePath),
    filePath,
    title: common.title || path.parse(filePath).name,
    artist: common.artist || common.albumartist || 'Unknown Artist',
    albumArtist: common.albumartist || null,
    album: common.album || 'Unknown Album',
    year: common.year || null,
    genre: firstOf(common.genre),
    composer: firstOf(common.composer),
    trackNumber: common.track?.no || null,
    trackTotal: common.track?.of || null,
    discNumber: common.disk?.no || null,
    discTotal: common.disk?.of || null,
    duration: format.duration || 0,
    bitrate: format.bitrate || 0,
    sampleRate: format.sampleRate || 0,
    bitsPerSample: format.bitsPerSample || null,
    channels: format.numberOfChannels || null,
    codec: format.codec || format.container || null,
    lossless: !!format.lossless,
    artId: art ? art.artId : null,
    src: toSafeFileUrl(filePath),
  };
  return { track, art };
}

function fallbackTrack(filePath, err, coverCache = null) {
  const cover = findFolderCover(path.dirname(filePath), coverCache);
  let art = null;
  if (cover) {
    const buffer = Buffer.from(cover.data);
    art = { artId: generateArtId(buffer), buffer, format: cover.format };
  }
  return {
    track: {
      id: generateTrackId(filePath),
      filePath,
      title: path.parse(filePath).name,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      duration: 0,
      artId: art ? art.artId : null,
      src: toSafeFileUrl(filePath),
      error: err ? err.message : undefined,
    },
    art,
  };
}

module.exports = {
  AUDIO_EXTENSIONS,
  generateTrackId,
  generateArtId,
  toSafeFileUrl,
  findFolderCover,
  trackFromMetadata,
  fallbackTrack,
};
