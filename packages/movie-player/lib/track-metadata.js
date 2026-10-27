'use strict';

// Shared track-building helpers used by MediaLibrary (main thread) and the
// background scan worker, so both produce identical track records.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const AUDIO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ogv', '.ts', '.m2ts', '.mpg', '.mpeg', '.flv', '.wmv', '.3gp',
  '.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac', '.opus', '.wma',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.ogv', '.ts', '.m2ts', '.mpg', '.mpeg', '.flv', '.wmv', '.3gp',
]);

// Image files commonly dropped next to movies or albums, in preference order.
const FOLDER_COVER_NAMES = ['poster', 'cover', 'folder', 'front', 'movie', 'thumb', 'fanart', 'album', 'albumart'];
const FOLDER_COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FOLDER_COVER_BYTES = 8 * 1024 * 1024;
const FOLDER_COVER_CACHE_SIZE = 32;

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
 * per directory in `cache` (a small LRU Map) so a 20-track album costs one readdir.
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
  if (cache) {
    // Scans visit one folder at a time, so a few recent folders are all that's worth
    // keeping; caching every folder's image would hold ~1 GB for a 100k-track library.
    if (cache.size >= FOLDER_COVER_CACHE_SIZE) cache.delete(cache.keys().next().value);
    cache.set(dir, found);
  }
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

  const cleaned = cleanMovieTitle(common.title || path.parse(filePath).name);
  const folderCleaned = cleanMovieTitle(path.basename(path.dirname(filePath)));
  const useFolderTitle = (!common.title && folderCleaned.year && !cleaned.year) || /^(movie|video|film|track|sample)$/i.test(cleaned.title);
  const bestTitle = common.title || (useFolderTitle ? folderCleaned.title : cleaned.title) || path.parse(filePath).name;
  const bestYear = common.year || cleaned.year || folderCleaned.year || null;
  const resBadge = [cleaned.resolution || folderCleaned.resolution, cleaned.source || folderCleaned.source].filter(Boolean).join(' ');

  const track = {
    id: generateTrackId(filePath),
    filePath,
    title: bestTitle,
    artist: common.artist || common.albumartist || (resBadge ? resBadge : 'Feature Film'),
    albumArtist: common.albumartist || null,
    album: common.album || (bestYear ? `${bestTitle} (${bestYear})` : bestTitle),
    year: bestYear,
    genre: firstOf(common.genre) || (VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ? 'Movies' : null),
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
  const cleaned = cleanMovieTitle(path.parse(filePath).name);
  const folderCleaned = cleanMovieTitle(path.basename(path.dirname(filePath)));
  const bestTitle = (folderCleaned.year && !cleaned.year ? folderCleaned.title : cleaned.title) || path.parse(filePath).name;
  const bestYear = cleaned.year || folderCleaned.year || null;
  const resBadge = [cleaned.resolution || folderCleaned.resolution, cleaned.source || folderCleaned.source].filter(Boolean).join(' ');
  return {
    track: {
      id: generateTrackId(filePath),
      filePath,
      title: bestTitle,
      artist: resBadge || 'Feature Film',
      album: bestYear ? `${bestTitle} (${bestYear})` : bestTitle,
      year: bestYear,
      genre: VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ? 'Movies' : null,
      duration: 0,
      artId: art ? art.artId : null,
      src: toSafeFileUrl(filePath),
      error: err ? err.message : undefined,
    },
    art,
  };
}

// Folder names that say nothing about the movie collection ("Movies", "Downloads").
const GENERIC_FOLDERS = new Set(['', '.', '/', 'movies', 'movie', 'films', 'video', 'videos', 'tv', 'shows', 'music', 'my music',
  'mp3', 'mp3s', 'audio', 'songs', 'albums', 'my drive', 'drive', 'onedrive', 'cloud', 'media', 'downloads', 'library',
  'itunes', 'itunes media', 'itunes music', 'shared with me', 'flac', 'misc', 'various', 'unsorted', 'new folder', 'sync', 'documents']);
const DISC_FOLDER = /^(cd|disc|disk|part|pt)\s*(\d+)$/i;

/**
 * Cleans scene-release movie filenames & folder names:
 * e.g. "Beetlejuice.Beetlejuice.2024.1080p.WEB.H264-BEETLEJUICE[TGx]"
 *   -> { title: "Beetlejuice Beetlejuice", year: 2024, resolution: "1080p", source: "WEB" }
 * e.g. "Dune (2021) [1080p] [WEBRip] [5.1] [YTS.MX]"
 *   -> { title: "Dune", year: 2021, resolution: "1080p", source: "WEBRip" }
 */
function cleanMovieTitle(raw) {
  const str = String(raw || '').trim();
  if (!str) return { title: '', year: null, resolution: null, source: null };

  const resMatch = /\b(2160p|4k|1080p|720p|480p)\b/i.exec(str);
  const resolution = resMatch ? resMatch[1].toUpperCase().replace('P', 'p') : null;

  const srcMatch = /\b(BluRay|BRRip|BDRip|WEBRip|WEB-DL|WEB|HDRip|DVDRip|HDTV|REMUX)\b/i.exec(str);
  const source = srcMatch ? srcMatch[1] : null;

  // Match year in parentheses/brackets or dot/space/underscore separated before quality tags
  const yearMatch = /[([.\s_]((19\d\d|20\d\d))(?:[)\].\s_]|$)/.exec(str);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  let head = str;
  if (yearMatch && yearMatch.index > 0) {
    head = str.slice(0, yearMatch.index);
  } else if (resMatch && resMatch.index > 0) {
    head = str.slice(0, resMatch.index);
  } else if (srcMatch && srcMatch.index > 0) {
    head = str.slice(0, srcMatch.index);
  }

  // Strip bracketed tags, release groups, leading/trailing dashes, and replace dots/underscores with spaces
  head = head
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(camrip|hdcam|ts|hdts|telesync|dvdscr|xvid|x264|x265|hevc|h264|aac|ac3|ddp5|10bit)\b.*$/i, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/^\s*[-–—:]+\s*/, '')
    .replace(/\s*[-–—:]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: head || str.replace(/[._]+/g, ' ').trim(),
    year,
    resolution,
    source,
  };
}

/**
 * Best guess at title / artist / album / year from a remote movie or audio path.
 */
function guessFromRemotePath(remotePath, name = '') {
  const parts = String(remotePath || '').split('/').filter(Boolean);
  const file = name || parts[parts.length - 1] || '';
  const ext = path.extname(file).toLowerCase();
  const rawName = path.parse(file).name;
  const isVideo = VIDEO_EXTENSIONS.has(ext);

  const dirs = parts.slice(0, -1);
  let discNumber = null;
  if (dirs.length && DISC_FOLDER.test(dirs[dirs.length - 1])) {
    discNumber = Number(DISC_FOLDER.exec(dirs[dirs.length - 1])[2]);
    dirs.pop();
  }
  const parentDir = dirs[dirs.length - 1] || '';
  const grandParentDir = dirs[dirs.length - 2] || '';

  if (isVideo) {
    const fileCleaned = cleanMovieTitle(rawName);
    const folderCleaned = parentDir && !GENERIC_FOLDERS.has(parentDir.toLowerCase())
      ? cleanMovieTitle(parentDir)
      : { title: '', year: null, resolution: null, source: null };

    const preferFolder = folderCleaned.title && (
      (folderCleaned.year && !fileCleaned.year) ||
      /^(movie|video|film|sample|feature|disc\s*\d+|part\s*\d+)$/i.test(fileCleaned.title) ||
      fileCleaned.title.length < 2
    );

    const title = (preferFolder ? folderCleaned.title : fileCleaned.title) || folderCleaned.title || rawName;
    const year = fileCleaned.year || folderCleaned.year || null;
    const resolution = fileCleaned.resolution || folderCleaned.resolution || null;
    const source = fileCleaned.source || folderCleaned.source || null;
    const badge = [resolution, source].filter(Boolean).join(' ');

    // Each movie gets its own poster card in the Library grid ("Title (Year)")
    const album = year ? `${title} (${year})` : title;
    const artist = badge || (grandParentDir && !GENERIC_FOLDERS.has(grandParentDir.toLowerCase()) ? grandParentDir : 'Feature Film');

    return {
      title,
      artist,
      album,
      trackNumber: null,
      discNumber,
      year,
      genre: 'Movies',
      resolution,
    };
  }

  let title = rawName.replace(/_/g, ' ').trim();
  const out = { title, artist: 'Unknown Artist', album: 'Unknown Album', trackNumber: null, discNumber, year: null };

  const num = /^(?:(\d{1,2})[-.])?(\d{1,3})(?:\s*[-.)_]\s*|\s+)(.+)$/.exec(title);
  if (num && Number(num[2]) > 0 && Number(num[2]) < 200) {
    out.trackNumber = Number(num[2]);
    if (num[1]) out.discNumber = Number(num[1]);
    title = num[3].trim();
  }
  const dash = title.split(' - ');
  if (dash.length >= 2 && dash[0].trim() && !/^\d+$/.test(dash[0].trim())) {
    out.artist = dash[0].trim();
    title = dash.slice(1).join(' - ').trim();
  }
  out.title = title || out.title;

  let albumDir = parentDir;
  const artistDir = grandParentDir;
  if (albumDir && !GENERIC_FOLDERS.has(albumDir.toLowerCase())) {
    const year = /\s*[([]((?:19|20)\d\d)[)\]]\s*/.exec(albumDir) || /^((?:19|20)\d\d)\s*-\s*/.exec(albumDir);
    if (year) { out.year = Number(year[1]); albumDir = albumDir.replace(year[0], ' ').trim(); }
    const split = albumDir.split(' - ');
    if (split.length >= 2 && !/^\d+$/.test(split[0].trim())) {
      if (out.artist === 'Unknown Artist') out.artist = split[0].trim();
      albumDir = split.slice(1).join(' - ').trim();
    }
    out.album = albumDir || out.album;
    if (out.artist === 'Unknown Artist' && artistDir && !GENERIC_FOLDERS.has(artistDir.toLowerCase())) out.artist = artistDir;
  }
  return out;
}

module.exports = {
  cleanMovieTitle,
  guessFromRemotePath,
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  generateTrackId,
  generateArtId,
  toSafeFileUrl,
  findFolderCover,
  trackFromMetadata,
  fallbackTrack,
};
